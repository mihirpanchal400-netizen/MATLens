import Papa from 'papaparse';
import type { RawTable } from '../types';

export class FileParseError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'FileParseError';
    this.hint = hint;
  }
}

const MAX_BYTES = 30 * 1024 * 1024;

function tidyColumns(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((raw, index) => {
    const name = String(raw ?? '').trim() || `Column ${index + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

function dropEmptyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((row) =>
    Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== ''),
  );
}

async function parseCsv(file: File): Promise<RawTable> {
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

  const columns = tidyColumns(result.meta.fields ?? Object.keys(result.data[0] ?? {}));
  const rows = dropEmptyRows(
    result.data.map((row) => {
      const mapped: Record<string, unknown> = {};
      (result.meta.fields ?? []).forEach((field, index) => {
        mapped[columns[index]] = row[field];
      });
      return mapped;
    }),
  );

  return { fileName: file.name, columns, rows };
}

async function parseExcel(file: File): Promise<RawTable> {
  // Loaded on demand: the spreadsheet parser is a third of the bundle and most
  // sessions either start with the demo dataset or upload a CSV.
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new FileParseError('This workbook contains no sheets.', 'Open the file in Excel and confirm it has at least one populated sheet.');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  if (matrix.length < 2) {
    throw new FileParseError(
      'No data rows were found in this workbook.',
      'MATLens expects a header row followed by data rows on the first sheet.',
    );
  }

  // Real exports often carry a title banner before the header. Use the first row
  // that looks like a header: mostly text, mostly populated, and the widest.
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
  const rows = dropEmptyRows(
    matrix.slice(headerIndex + 1).map((line) => {
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = line[index] ?? null;
      });
      return row;
    }),
  );

  if (!rows.length) {
    throw new FileParseError(
      'The first sheet has a header but no data rows.',
      'Check that the data is on the first sheet of the workbook.',
    );
  }

  return { fileName: file.name, sheetName, columns, rows };
}

/** Reads a user-supplied .csv / .xlsx / .xls file into a raw table. */
export async function parseFile(file: File): Promise<RawTable> {
  if (file.size === 0) {
    throw new FileParseError('This file is empty (0 bytes).', 'Re-export the file from Excel and try again.');
  }
  if (file.size > MAX_BYTES) {
    throw new FileParseError(
      `This file is ${(file.size / 1024 / 1024).toFixed(0)} MB, which is larger than the 30 MB prototype limit.`,
      'MATLens parses files entirely in the browser. Filter the extract to the therapy area you are analysing and try again.',
    );
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  try {
    if (extension === 'csv' || extension === 'txt') return await parseCsv(file);
    if (extension === 'xlsx' || extension === 'xls' || extension === 'xlsm') return await parseExcel(file);
  } catch (error) {
    if (error instanceof FileParseError) throw error;
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

/** Loads one of the bundled demo variants from /public/demo-data. */
export async function fetchDemoFile(path: string, fileName: string): Promise<File> {
  const response = await fetch(path);
  if (!response.ok) throw new FileParseError(`Could not load ${fileName}.`, 'The bundled demo file is missing from /public/demo-data.');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type });
}
