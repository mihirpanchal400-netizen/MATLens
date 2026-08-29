/**
 * Streaming XLSX reader.
 *
 * The problem it solves
 * ---------------------
 * A market basefile can hold a worksheet whose XML is larger than JavaScript's
 * maximum string length (512 MB). Every ordinary spreadsheet parser decompresses
 * a sheet into one string, so past that ceiling it cannot read the sheet at all —
 * and SheetJS drops it silently rather than raising. A 211 MB PharmaTrac IPM
 * export decompresses to 672 MB: 129 MB beyond the wall.
 *
 * How this reader works
 * ---------------------
 *  1. Reads the ZIP central directory directly off the File, so no part of the
 *     archive is loaded that is not needed.
 *  2. Inflates one entry at a time through the platform's native
 *     `DecompressionStream`, consuming it chunk by chunk.
 *  3. Scans the sheet XML with a small purpose-built scanner that holds only the
 *     current row in memory. The full sheet is never a string, so the 512 MB
 *     ceiling never applies.
 *  4. Projects wide files down to the columns that can matter analytically —
 *     a 180-column basefile is 94% monthly and quarterly columns MATLens does not
 *     use, and retaining them would exhaust the tab's memory for nothing. What
 *     was kept and what was skipped is reported back, never hidden.
 *
 * It is async throughout, so the event loop stays free between chunks and the UI
 * keeps painting progress. It runs unchanged on Node, which is how it is tested.
 */
import type { RawTable } from '../types';

export interface XlsxProgress {
  rows: number;
  fraction: number;
  stage: 'reading' | 'parsing' | 'organising';
}

export class XlsxStreamError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'XlsxStreamError';
    this.hint = hint;
  }
}

/** True when the platform can inflate a stream without a third-party library. */
export function canStreamXlsx(): boolean {
  return typeof DecompressionStream !== 'undefined' && typeof Blob !== 'undefined';
}

/* ------------------------------------------------------------------ */
/* ZIP central directory                                               */
/* ------------------------------------------------------------------ */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;

async function sliceBuffer(file: Blob, start: number, end: number): Promise<DataView> {
  const buffer = await file.slice(start, Math.min(end, file.size)).arrayBuffer();
  return new DataView(buffer);
}

/** Locates the end-of-central-directory record, which sits in the last 64 KB. */
async function findEocd(file: Blob): Promise<{ view: DataView; offset: number }> {
  const tailLength = Math.min(file.size, 0xffff + 22);
  const base = file.size - tailLength;
  const view = await sliceBuffer(file, base, file.size);
  for (let i = view.byteLength - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      return { view, offset: i };
    }
  }
  throw new XlsxStreamError(
    'This file is not a readable .xlsx archive.',
    'An .xlsx file is a ZIP archive, and no ZIP directory was found. The file may be an old .xls, a renamed file, or corrupt. Re-save it from Excel as .xlsx.',
  );
}

async function readCentralDirectory(file: Blob): Promise<Map<string, ZipEntry>> {
  const { view, offset } = await findEocd(file);

  let entryCount = view.getUint16(offset + 10, true);
  let directorySize = view.getUint32(offset + 12, true);
  let directoryOffset = view.getUint32(offset + 16, true);

  // ZIP64 — used once an archive passes 4 GB or 65,535 entries.
  if (directoryOffset === 0xffffffff || entryCount === 0xffff || directorySize === 0xffffffff) {
    const locatorOffset = offset - 20;
    if (locatorOffset >= 0 && view.getUint32(locatorOffset, true) === ZIP64_LOCATOR_SIGNATURE) {
      const zip64Offset = Number(view.getBigUint64(locatorOffset + 8, true));
      const zip64 = await sliceBuffer(file, zip64Offset, zip64Offset + 56);
      if (zip64.getUint32(0, true) === ZIP64_EOCD_SIGNATURE) {
        entryCount = Number(zip64.getBigUint64(32, true));
        directorySize = Number(zip64.getBigUint64(40, true));
        directoryOffset = Number(zip64.getBigUint64(48, true));
      }
    }
  }

  const directory = await sliceBuffer(file, directoryOffset, directoryOffset + directorySize);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();

  let cursor = 0;
  for (let i = 0; i < entryCount && cursor + 46 <= directory.byteLength; i += 1) {
    if (directory.getUint32(cursor, true) !== CENTRAL_SIGNATURE) break;

    const method = directory.getUint16(cursor + 10, true);
    let compressedSize = directory.getUint32(cursor + 20, true);
    let uncompressedSize = directory.getUint32(cursor + 24, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    let localHeaderOffset = directory.getUint32(cursor + 42, true);

    const nameBytes = new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength);
    const name = decoder.decode(nameBytes);

    // ZIP64 extended information, when any 32-bit field is saturated.
    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      let extraCursor = cursor + 46 + nameLength;
      const extraEnd = extraCursor + extraLength;
      while (extraCursor + 4 <= extraEnd) {
        const headerId = directory.getUint16(extraCursor, true);
        const dataSize = directory.getUint16(extraCursor + 2, true);
        if (headerId === 0x0001) {
          let field = extraCursor + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(directory.getBigUint64(field, true));
            field += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(directory.getBigUint64(field, true));
            field += 8;
          }
          if (localHeaderOffset === 0xffffffff) {
            localHeaderOffset = Number(directory.getBigUint64(field, true));
          }
          break;
        }
        extraCursor += 4 + dataSize;
      }
    }

    entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  if (!entries.size) {
    throw new XlsxStreamError(
      'This workbook appears to be empty.',
      'No entries were found inside the .xlsx archive.',
    );
  }
  return entries;
}

/** Opens one archive entry as a stream of decompressed bytes. */
async function openEntry(file: Blob, entry: ZipEntry): Promise<ReadableStream<Uint8Array>> {
  // The local header repeats the name and extra length, which may differ from the
  // central directory's, so the data offset has to be read from it.
  const header = await sliceBuffer(file, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  const nameLength = header.getUint16(26, true);
  const extraLength = header.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  const slice = file.slice(dataStart, dataEnd);

  const source = slice.stream() as unknown as ReadableStream<Uint8Array>;
  if (entry.method === 0) return source;
  if (entry.method !== 8) {
    throw new XlsxStreamError(
      `${entry.name} uses an unsupported compression method.`,
      'Re-save the workbook from Excel, which writes standard deflate compression.',
    );
  }
  // The DOM lib types these pairs more loosely than the stream generics allow.
  return source.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

/** Reads a small entry fully into a string. Only used for parts known to be small. */
async function readEntryText(file: Blob, entry: ZipEntry): Promise<string> {
  const stream = await openEntry(file, entry);
  const reader = stream
    .pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>)
    .getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* XML helpers                                                         */
/* ------------------------------------------------------------------ */

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  if (text.indexOf('&') === -1) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITY[body] ?? match;
  });
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

/** "AB12" -> 27 (zero-based column index). */
function columnIndex(reference: string): number {
  let index = 0;
  for (let i = 0; i < reference.length; i += 1) {
    const code = reference.charCodeAt(i);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/**
 * Feeds decompressed bytes through a callback as text, chunk by chunk.
 * Yields to the event loop between chunks so the UI stays responsive.
 */
async function consumeText(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void | Promise<void>,
  onBytes?: (bytes: number) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    onBytes?.(bytes);
    await onChunk(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) await onChunk(tail);
}

/* ------------------------------------------------------------------ */
/* Shared strings                                                      */
/* ------------------------------------------------------------------ */

/**
 * Streams sharedStrings.xml into an array. Only the `<t>` runs are kept, so the
 * XML itself is never held whole.
 */
async function readSharedStrings(file: Blob, entry: ZipEntry | undefined): Promise<string[]> {
  if (!entry) return [];
  const strings: string[] = [];
  let buffer = '';
  let current: string | null = null;

  const stream = await openEntry(file, entry);
  await consumeText(stream, (text) => {
    buffer += text;
    for (;;) {
      if (current === null) {
        const start = buffer.indexOf('<si');
        if (start === -1) {
          // Keep a small tail in case a tag straddles the chunk boundary.
          buffer = buffer.slice(Math.max(0, buffer.length - 8));
          return;
        }
        const close = buffer.indexOf('>', start);
        if (close === -1) return;
        if (buffer[close - 1] === '/') {
          strings.push('');
          buffer = buffer.slice(close + 1);
          continue;
        }
        current = '';
        buffer = buffer.slice(close + 1);
      }

      const end = buffer.indexOf('</si>');
      if (end === -1) {
        // Collect any complete <t> runs already in the buffer, then wait.
        const consumedTo = collectTextRuns(buffer, (value) => {
          current += value;
        });
        buffer = buffer.slice(consumedTo);
        return;
      }

      const body = buffer.slice(0, end);
      collectTextRuns(body, (value) => {
        current += value;
      });
      strings.push(current);
      current = null;
      buffer = buffer.slice(end + 5);
    }
  });

  return strings;
}

/** Pulls every complete `<t>…</t>` out of a fragment, returning how much was consumed. */
function collectTextRuns(fragment: string, emit: (value: string) => void): number {
  let cursor = 0;
  let consumed = 0;
  for (;;) {
    const open = fragment.indexOf('<t', cursor);
    if (open === -1) break;
    const openEnd = fragment.indexOf('>', open);
    if (openEnd === -1) break;
    if (fragment[openEnd - 1] === '/') {
      cursor = openEnd + 1;
      consumed = cursor;
      continue;
    }
    const close = fragment.indexOf('</t>', openEnd);
    if (close === -1) break;
    emit(decodeEntities(fragment.slice(openEnd + 1, close)));
    cursor = close + 4;
    consumed = cursor;
  }
  return consumed;
}

/* ------------------------------------------------------------------ */
/* Sheet scanning                                                      */
/* ------------------------------------------------------------------ */

type SheetRow = Array<string | number | null>;

/** Parses one complete `<row>…</row>` fragment into a sparse array of cell values. */
function parseRow(fragment: string, sharedStrings: string[]): SheetRow {
  const cells: SheetRow = [];
  let cursor = 0;

  for (;;) {
    const open = fragment.indexOf('<c', cursor);
    if (open === -1) break;
    // Guard against matching <col> or similar.
    const nextChar = fragment[open + 2];
    if (nextChar !== ' ' && nextChar !== '>' && nextChar !== '/') {
      cursor = open + 2;
      continue;
    }
    const openEnd = fragment.indexOf('>', open);
    if (openEnd === -1) break;
    const tag = fragment.slice(open, openEnd + 1);
    const selfClosing = fragment[openEnd - 1] === '/';

    const reference = attribute(tag, 'r');
    const index = reference ? columnIndex(reference) : cells.length;
    const type = attribute(tag, 't');

    if (selfClosing) {
      if (index >= 0) cells[index] = null;
      cursor = openEnd + 1;
      continue;
    }

    const close = fragment.indexOf('</c>', openEnd);
    const body = close === -1 ? fragment.slice(openEnd + 1) : fragment.slice(openEnd + 1, close);
    cursor = close === -1 ? fragment.length : close + 4;

    let value: string | number | null = null;

    if (type === 'inlineStr') {
      let text = '';
      collectTextRuns(body, (part) => {
        text += part;
      });
      value = text;
    } else {
      const vStart = body.indexOf('<v');
      if (vStart !== -1) {
        const vOpenEnd = body.indexOf('>', vStart);
        const vClose = body.indexOf('</v>', vOpenEnd);
        if (vOpenEnd !== -1 && vClose !== -1) {
          const raw = body.slice(vOpenEnd + 1, vClose);
          if (type === 's') {
            const stringIndex = Number(raw);
            value = sharedStrings[stringIndex] ?? '';
          } else if (type === 'b') {
            value = raw === '1' ? 'TRUE' : 'FALSE';
          } else if (type === 'e') {
            value = decodeEntities(raw);
          } else if (type === 'str') {
            value = decodeEntities(raw);
          } else {
            const numeric = Number(raw);
            value = Number.isFinite(numeric) ? numeric : decodeEntities(raw);
          }
        }
      }
    }

    if (index >= 0) cells[index] = value;
  }

  return cells;
}

/* ------------------------------------------------------------------ */
/* Column projection                                                   */
/* ------------------------------------------------------------------ */

/** Above this many columns, a wide export is projected down to what can matter. */
const PROJECTION_THRESHOLD = 40;
const MAX_RETAINED_COLUMNS = 64;

const NUMERIC_LIKE = /^-?\(?\s*[₹$€£]?\s*-?[\d,]*\.?\d+\s*\)?%?$/;

function looksNumeric(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return true;
  return NUMERIC_LIKE.test(String(value).trim());
}

/**
 * Chooses which columns of a very wide export to retain.
 *
 * A basefile carries five years of monthly, quarterly and YTD columns. MATLens
 * analyses MAT periods, so the rule is: every dimension (text) column, plus every
 * numeric column that names a MAT period or a metric MATLens understands. On the
 * 180-column IPM export this keeps 30 and drops 150 that could not be used.
 */
function chooseColumns(headers: string[], sample: SheetRow[]): { keep: number[]; skipped: string[] } {
  if (headers.length <= PROJECTION_THRESHOLD) {
    return { keep: headers.map((_, i) => i), skipped: [] };
  }

  const MEANINGFUL = /\bmat\b|moving annual|brand|company|corporate|manufactur|molecule|composition|generic|active ingredient|therap|segment|class|group|region|geograph|zone|territory|state|division|sku|pack|period|growth|share|rank|total/i;
  const PERIODIC = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-\d{2}\b|\bq[1-4]\b|\bytd\b|\bmth\b|\bmonth\b|\bquarter\b/i;

  const keep: number[] = [];
  const skipped: string[] = [];

  headers.forEach((header, index) => {
    const values = sample.map((row) => row[index]).filter((v) => v !== null && v !== undefined && v !== '');
    const numericShare = values.length ? values.filter(looksNumeric).length / values.length : 0;
    const isText = values.length > 0 && numericShare < 0.6;
    const namesMat = /\bmat\b|moving annual/i.test(header);
    const meaningful = MEANINGFUL.test(header);
    const periodicOnly = PERIODIC.test(header) && !namesMat;

    // Dimensions are always kept; numeric columns only when they name a MAT
    // period or a metric the product understands, and never when they are a
    // monthly / quarterly / YTD series.
    if (isText || namesMat || (meaningful && !periodicOnly)) keep.push(index);
    else skipped.push(header);
  });

  if (keep.length > MAX_RETAINED_COLUMNS) {
    const trimmed = keep.slice(0, MAX_RETAINED_COLUMNS);
    for (const index of keep.slice(MAX_RETAINED_COLUMNS)) skipped.push(headers[index]);
    return { keep: trimmed, skipped };
  }

  return { keep, skipped };
}

function tidyHeaders(cells: SheetRow): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, index) => {
    const name = String(cell ?? '').trim() || `Column ${index + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export interface StreamedTable extends RawTable {
  /** Columns present in the file but not retained, with the reason reported to the user. */
  skippedColumns: string[];
  /** Rows in the sheet, including any dropped as blank. */
  sheetRowCount: number;
}

export async function readXlsxStreaming(
  file: File,
  onProgress?: (progress: XlsxProgress) => void,
): Promise<StreamedTable> {
  if (!canStreamXlsx()) {
    throw new XlsxStreamError(
      'This browser cannot stream large spreadsheets.',
      'Streaming needs DecompressionStream, which is available in current versions of Chrome, Edge, Firefox and Safari. Update the browser, or convert the file with: npm run convert',
    );
  }

  onProgress?.({ rows: 0, fraction: 0, stage: 'reading' });
  const entries = await readCentralDirectory(file);

  const worksheets = [...entries.values()].filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name));
  if (!worksheets.length) {
    throw new XlsxStreamError(
      'No worksheet was found inside this workbook.',
      'The archive contains no xl/worksheets entry. Re-save the file from Excel as .xlsx.',
    );
  }

  // The sheet holding the data is the largest one; cover and pivot sheets are tiny.
  worksheets.sort((a, b) => b.uncompressedSize - a.uncompressedSize);
  const sheetEntry = worksheets[0];

  // Recover the human-readable sheet name via workbook.xml and its relationships.
  let sheetName = sheetEntry.name.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, '');
  try {
    const workbookEntry = entries.get('xl/workbook.xml');
    const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
    if (workbookEntry && relsEntry) {
      const relsXml = await readEntryText(file, relsEntry);
      const target = sheetEntry.name.replace(/^xl\//, '');
      const relMatch = new RegExp(`<Relationship[^>]*Id="([^"]+)"[^>]*Target="/?(?:xl/)?${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').exec(relsXml)
        ?? new RegExp(`<Relationship[^>]*Target="/?(?:xl/)?${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*Id="([^"]+)"`, 'i').exec(relsXml);
      if (relMatch) {
        const workbookXml = await readEntryText(file, workbookEntry);
        const sheetMatch = new RegExp(`<sheet[^>]*name="([^"]*)"[^>]*r:id="${relMatch[1]}"`, 'i').exec(workbookXml)
          ?? new RegExp(`<sheet[^>]*r:id="${relMatch[1]}"[^>]*name="([^"]*)"`, 'i').exec(workbookXml);
        if (sheetMatch) sheetName = decodeEntities(sheetMatch[1]);
      }
    }
  } catch {
    // The sheet name is cosmetic; a failure here must not stop the read.
  }

  onProgress?.({ rows: 0, fraction: 0.02, stage: 'parsing' });
  const sharedStrings = await readSharedStrings(file, entries.get('xl/sharedStrings.xml'));

  /* ---- stream the sheet ---- */
  const totalBytes = sheetEntry.uncompressedSize || sheetEntry.compressedSize * 4;
  let headers: string[] | null = null;
  let keep: number[] | null = null;
  let skipped: string[] = [];
  const sample: SheetRow[] = [];
  const rows: Record<string, unknown>[] = [];
  let sheetRowCount = 0;
  let buffer = '';
  let insideSheetData = false;
  let lastYield = Date.now();

  const emitRow = (cells: SheetRow) => {
    sheetRowCount += 1;

    if (!headers) {
      if (!cells.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) return;
      headers = tidyHeaders(cells);
      return;
    }

    // Buffer a sample before deciding which columns to retain, then project.
    if (!keep) {
      sample.push(cells);
      if (sample.length < 120) return;
      const chosen = chooseColumns(headers, sample);
      keep = chosen.keep;
      skipped = chosen.skipped;
      for (const buffered of sample) pushRow(buffered);
      sample.length = 0;
      return;
    }

    pushRow(cells);
  };

  function pushRow(cells: SheetRow) {
    if (!headers || !keep) return;
    let empty = true;
    const row: Record<string, unknown> = {};
    for (const index of keep) {
      const value = cells[index];
      row[headers[index]] = value === undefined ? null : value;
      if (value !== null && value !== undefined && String(value).trim() !== '') empty = false;
    }
    if (!empty) rows.push(row);
  }

  const stream = await openEntry(file, sheetEntry);
  await consumeText(
    stream,
    async (text) => {
      buffer += text;

      if (!insideSheetData) {
        const start = buffer.indexOf('<sheetData');
        if (start === -1) {
          buffer = buffer.slice(Math.max(0, buffer.length - 16));
          return;
        }
        const close = buffer.indexOf('>', start);
        if (close === -1) return;
        insideSheetData = true;
        buffer = buffer.slice(close + 1);
      }

      for (;;) {
        const open = buffer.indexOf('<row');
        if (open === -1) {
          const end = buffer.indexOf('</sheetData>');
          if (end !== -1) buffer = '';
          else buffer = buffer.slice(Math.max(0, buffer.length - 8));
          break;
        }
        const openEnd = buffer.indexOf('>', open);
        if (openEnd === -1) break;

        if (buffer[openEnd - 1] === '/') {
          buffer = buffer.slice(openEnd + 1);
          continue;
        }

        const close = buffer.indexOf('</row>', openEnd);
        if (close === -1) {
          buffer = buffer.slice(open);
          break;
        }

        emitRow(parseRow(buffer.slice(openEnd + 1, close), sharedStrings));
        buffer = buffer.slice(close + 6);
      }

      // Hand the event loop back a few times a second so progress paints.
      if (Date.now() - lastYield > 120) {
        lastYield = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    (bytes) => {
      onProgress?.({
        rows: rows.length,
        fraction: Math.min(0.98, 0.02 + (bytes / totalBytes) * 0.96),
        stage: 'parsing',
      });
    },
  );

  // A sheet shorter than the sample never chose its columns.
  if (headers && !keep) {
    const chosen = chooseColumns(headers, sample);
    keep = chosen.keep;
    skipped = chosen.skipped;
    for (const buffered of sample) pushRow(buffered);
  }

  if (!headers) {
    throw new XlsxStreamError(
      `No header row was found in "${sheetName}".`,
      'MATLens expects a header row followed by data rows on the sheet holding the data.',
    );
  }
  if (!rows.length) {
    throw new XlsxStreamError(
      `The sheet "${sheetName}" has a header but no data rows.`,
      'Check that the data is on the sheet you expect it to be on.',
    );
  }

  onProgress?.({ rows: rows.length, fraction: 1, stage: 'organising' });

  const retained = keep ?? [];
  return {
    fileName: file.name,
    sheetName,
    columns: retained.map((index) => headers![index]),
    rows,
    skippedColumns: skipped,
    sheetRowCount,
  };
}
