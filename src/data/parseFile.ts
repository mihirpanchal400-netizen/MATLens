import Papa from 'papaparse';
import type { RawTable } from '../types';
import { canStreamXlsx, readXlsxStreaming, XlsxStreamError } from './xlsxStream';

export class FileParseError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'FileParseError';
    this.hint = hint;
  }
}

/**
 * Practical ceiling for in-browser parsing.
 *
 * The binding constraint is not this number — it is JavaScript's maximum string
 * length (512 MB in V8). A worksheet whose XML exceeds it cannot be opened by
 * any browser or any Node build, because the engine cannot hold it. CSV is
 * streamed chunk by chunk and never becomes one string, so it scales further
 * than a workbook of the same row count.
 */
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Above this, a workbook is read with the streaming reader rather than SheetJS.
 * SheetJS is faster and more tolerant on ordinary files; it simply cannot open a
 * sheet whose XML passes the 512 MB string ceiling, and a compressed workbook
 * this size routinely does.
 */
const XLSX_STREAM_BYTES = 20 * 1024 * 1024;

/** Above this, a workbook is large enough that the user is warned it will take a while. */
const XLSX_CAUTION_BYTES = 60 * 1024 * 1024;

/** Above this, CSV is parsed in streaming mode with progress rather than in one pass. */
const STREAM_THRESHOLD_BYTES = 8 * 1024 * 1024;

/**
 * Chunked parsing reads the File through FileReader, which exists in browsers
 * and in jsdom but not in bare Node. The verification harness runs in Node, so
 * the module falls back to the single-pass path rather than failing there.
 */
const canStreamFiles = typeof FileReader !== 'undefined';

export interface ParseProgress {
  /** Rows read so far. */
  rows: number;
  /** 0–1 where the source size is known. */
  fraction: number;
  stage: 'reading' | 'parsing' | 'organising';
}

export type ProgressHandler = (progress: ParseProgress) => void;

/** Internal signal: SheetJS could not materialise the sheet, so streaming should take over. */
class OversizedSheetError extends Error {
  constructor(readonly sheets: string) {
    super('worksheet exceeded the string ceiling');
  }
}

const CONVERTER_HINT =
  'Run the bundled converter, which streams the workbook without ever holding it in memory:  npm run convert -- --in "<path to your file>"  — it writes a slim CSV with just the columns MATLens analyses, which opens instantly.';

function tidyColumns(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((raw, index) => {
    const name = String(raw ?? '').trim() || `Column ${index + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

function isBlankRow(row: Record<string, unknown>): boolean {
  return !Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
}

/**
 * Streaming CSV parse. Papa reads the file in chunks, so the whole text never
 * becomes a single string and the event loop stays free enough to paint progress.
 */
function parseCsvStreaming(file: File, onProgress?: ProgressHandler): Promise<RawTable> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    let columns: string[] | null = null;
    let sourceFields: string[] = [];
    let bytesSeen = 0;

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      transformHeader: (h) => String(h ?? '').trim(),
      chunkSize: 4 * 1024 * 1024,
      chunk: (results, parser) => {
        if (!columns) {
          sourceFields = results.meta.fields ?? [];
          columns = tidyColumns(sourceFields);
          if (!columns.length) {
            parser.abort();
            reject(
              new FileParseError(
                'No column headers were found in this file.',
                'MATLens expects the first line of a CSV to be the header row.',
              ),
            );
            return;
          }
        }

        for (const row of results.data) {
          const mapped: Record<string, unknown> = {};
          sourceFields.forEach((field, index) => {
            mapped[columns![index]] = row[field];
          });
          if (!isBlankRow(mapped)) rows.push(mapped);
        }

        bytesSeen += results.meta.cursor > bytesSeen ? results.meta.cursor - bytesSeen : 0;
        onProgress?.({
          rows: rows.length,
          fraction: file.size ? Math.min(1, results.meta.cursor / file.size) : 0,
          stage: 'parsing',
        });
      },
      complete: () => {
        if (!rows.length) {
          reject(
            new FileParseError(
              'No data rows were found in this file.',
              'The file appears to contain only a header row, or no rows at all. Export the sheet again with data included.',
            ),
          );
          return;
        }
        onProgress?.({ rows: rows.length, fraction: 1, stage: 'organising' });
        resolve({ fileName: file.name, columns: columns ?? [], rows });
      },
      error: (error: Error) => {
        reject(new FileParseError(`${file.name} could not be read.`, error.message));
      },
    });
  });
}

/** Small CSVs take the simpler single-pass path. */
async function parseCsvWhole(file: File): Promise<RawTable> {
  const text = await file.text();
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (h) => String(h ?? '').trim(),
  });

  if (!result.data.length) {
    throw new FileParseError(
      'No data rows were found in this file.',
      'The file appears to contain only a header row, or no rows at all. Export the sheet again with data included.',
    );
  }

  const fields = result.meta.fields ?? Object.keys(result.data[0] ?? {});
  const columns = tidyColumns(fields);
  const rows = result.data
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      fields.forEach((field, index) => {
        mapped[columns[index]] = row[field];
      });
      return mapped;
    })
    .filter((row) => !isBlankRow(row));

  return { fileName: file.name, columns, rows };
}

/**
 * Reads a workbook with the streaming reader, which never holds the sheet XML as
 * a string and so has no size ceiling beyond available memory.
 */
async function parseExcelStreaming(file: File, onProgress?: ProgressHandler): Promise<RawTable> {
  const table = await readXlsxStreaming(file, (progress) => onProgress?.(progress));
  return table;
}

async function parseExcelWhole(file: File, onProgress?: ProgressHandler): Promise<RawTable> {
  // Loaded on demand: the spreadsheet parser is a third of the bundle and most
  // sessions either start with the demo dataset or upload a CSV.
  onProgress?.({ rows: 0, fraction: 0, stage: 'reading' });
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();

  onProgress?.({ rows: 0, fraction: 0.2, stage: 'parsing' });

  let workbook: import('xlsx').WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/string length|Invalid string length|out of memory/i.test(message)) {
      throw new FileParseError(
        `${file.name} is too large for a browser to open.`,
        `One of its worksheets exceeds JavaScript's maximum string length of 512 MB once decompressed, which no browser can hold. ${CONVERTER_HINT}`,
      );
    }
    throw new FileParseError(
      `${file.name} could not be read.`,
      'The file may be password-protected, corrupted, or saved in an unsupported format. Try re-saving it as .xlsx or .csv.',
    );
  }

  if (!workbook.SheetNames.length) {
    throw new FileParseError('This workbook contains no sheets.', 'Open the file in Excel and confirm it has at least one populated sheet.');
  }

  // A sheet whose XML exceeded the string ceiling is dropped silently by the
  // parser: it stays in SheetNames but never appears in Sheets. Catching that
  // is the difference between a precise explanation and a mystery.
  const materialised = workbook.SheetNames.filter((name) => workbook.Sheets[name]);
  const missing = workbook.SheetNames.filter((name) => !workbook.Sheets[name]);

  if (!materialised.length) {
    // The sheet exceeded the string ceiling and was dropped silently. The
    // streaming reader has no such ceiling, so hand over to it rather than fail.
    throw new OversizedSheetError(workbook.SheetNames.join(', '));
  }

  // Prefer the sheet with the most data rather than blindly the first — pivot
  // and cover sheets are routinely placed ahead of the data.
  let sheetName = materialised[0];
  let bestRows = -1;
  for (const name of materialised) {
    const ref = workbook.Sheets[name]['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const size = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (size > bestRows) {
      bestRows = size;
      sheetName = name;
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  if (matrix.length < 2) {
    throw new FileParseError(
      'No data rows were found in this workbook.',
      missing.length
        ? `The sheet that was read ("${sheetName}") has no data rows, and ${missing.length} other sheet(s) were too large for the browser to open. ${CONVERTER_HINT}`
        : 'MATLens expects a header row followed by data rows.',
    );
  }

  onProgress?.({ rows: matrix.length, fraction: 0.8, stage: 'organising' });

  // Real exports often carry a title banner before the header. Use the first row
  // that looks like a header: mostly populated, and as wide as the sheet.
  const width = Math.max(...matrix.slice(0, 20).map((r) => r.length));
  let headerIndex = 0;
  for (let i = 0; i < Math.min(matrix.length, 15); i += 1) {
    const filled = matrix[i].filter((c) => c !== null && String(c).trim() !== '').length;
    if (filled >= Math.max(2, width * 0.6)) {
      headerIndex = i;
      break;
    }
  }

  const columns = tidyColumns((matrix[headerIndex] ?? []).map((c) => String(c ?? '')));
  const rows = matrix
    .slice(headerIndex + 1)
    .map((line) => {
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = line[index] ?? null;
      });
      return row;
    })
    .filter((row) => !isBlankRow(row));

  if (!rows.length) {
    throw new FileParseError(
      `The sheet "${sheetName}" has a header but no data rows.`,
      'Check that the data is on the sheet you expect it to be on.',
    );
  }

  return { fileName: file.name, sheetName, columns, rows };
}

/** Reads a user-supplied .csv / .xlsx / .xls file into a raw table. */
export async function parseFile(file: File, onProgress?: ProgressHandler): Promise<RawTable> {
  if (file.size === 0) {
    throw new FileParseError('This file is empty (0 bytes).', 'Re-export the file from Excel and try again.');
  }
  if (file.size > MAX_BYTES) {
    throw new FileParseError(
      `This file is ${(file.size / 1024 / 1024).toFixed(0)} MB, beyond what a browser tab can hold.`,
      `MATLens parses files locally in your browser, which caps out around ${MAX_BYTES / 1024 / 1024} MB. ${CONVERTER_HINT}`,
    );
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  try {
    if (extension === 'csv' || extension === 'txt') {
      return file.size > STREAM_THRESHOLD_BYTES && canStreamFiles
        ? await parseCsvStreaming(file, onProgress)
        : await parseCsvWhole(file);
    }
    if (extension === 'xlsx' || extension === 'xlsm') {
      // Large workbooks go straight to the streaming reader. Smaller ones use
      // SheetJS, which is quicker and more forgiving, and fall back to streaming
      // if it turns out the sheet could not be materialised.
      if (file.size > XLSX_STREAM_BYTES && canStreamXlsx()) {
        return await parseExcelStreaming(file, onProgress);
      }
      try {
        return await parseExcelWhole(file, onProgress);
      } catch (error) {
        if (error instanceof OversizedSheetError && canStreamXlsx()) {
          return await parseExcelStreaming(file, onProgress);
        }
        throw error;
      }
    }
    if (extension === 'xls') {
      // The old binary format is not a ZIP archive, so streaming does not apply.
      return await parseExcelWhole(file, onProgress);
    }
  } catch (error) {
    if (error instanceof FileParseError) throw error;
    if (error instanceof XlsxStreamError) throw new FileParseError(error.message, error.hint);
    if (error instanceof OversizedSheetError) {
      throw new FileParseError(
        `${file.name} is too large for this browser to open.`,
        `Its worksheet (${error.sheets}) exceeds JavaScript's 512 MB maximum string length once decompressed, and this browser does not support streaming decompression. ${CONVERTER_HINT}`,
      );
    }
    const message = error instanceof Error ? error.message : '';
    if (/string length|out of memory|Array buffer allocation/i.test(message)) {
      throw new FileParseError(
        `${file.name} is too large for a browser to open.`,
        `It exceeded the browser engine's memory or string-length limits while being read. ${CONVERTER_HINT}`,
      );
    }
    throw new FileParseError(
      `${file.name} could not be read.`,
      'The file may be password-protected, corrupted, or saved in an unsupported format. Try re-saving it as .xlsx or .csv.',
    );
  }

  throw new FileParseError(
    `.${extension || '(no extension)'} files are not supported.`,
    'MATLens accepts .xlsx and .csv exports. Save your file in one of those formats and upload again.',
  );
}

/** True when a workbook is large enough that the user deserves a warning first. */
export function isLargeWorkbook(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (extension === 'xlsx' || extension === 'xlsm' || extension === 'xls') && file.size > XLSX_CAUTION_BYTES;
}

export const LIMITS = { MAX_BYTES, XLSX_CAUTION_BYTES, XLSX_STREAM_BYTES, STREAM_THRESHOLD_BYTES, CONVERTER_HINT };

/** Loads one of the bundled demo variants from /public/demo-data. */
export async function fetchDemoFile(path: string, fileName: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) throw new FileParseError(`Could not load ${fileName}.`, 'The bundled demo file is missing from /public/demo-data.');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}
