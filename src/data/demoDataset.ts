import type { Dataset, RawTable } from '../types';
import { buildDataset } from './buildDataset';
import { mapColumns } from './columnMapper';
import { DEMO_COLUMNS, DEMO_FOCUS_BRAND, DEMO_PERIOD, generateDemoRows } from './demoGenerator.js';

export const DEMO_FILE_NAME = `MATLens_Demo_Dermatology_${DEMO_PERIOD.replace(/\s+/g, '_')}.xlsx`;

export const DEMO_DESCRIPTION =
  'A synthetic Indian dermatology market extract: 288 rows covering 64 invented brands from 26 invented companies, across 6 segments, 29 molecules and 5 regions, with current and previous MAT value and units.';

/**
 * Loads the demo dataset through exactly the same pipeline as an uploaded file:
 * raw table -> automatic column mapping -> validation -> normalised rows.
 * Nothing about the demo path is privileged, which is the point — if the mapper
 * or the validator regresses, the demo breaks first.
 */
export function loadDemoDataset(): Dataset {
  const rows = generateDemoRows() as Array<Record<string, unknown>>;
  const raw: RawTable = {
    fileName: DEMO_FILE_NAME,
    sheetName: 'Master Data',
    columns: [...DEMO_COLUMNS],
    rows,
  };

  const mappings = mapColumns(raw);

  return buildDataset({
    raw,
    mappings,
    isSynthetic: true,
    defaultFocusBrand: DEMO_FOCUS_BRAND,
    notes: [
      'This is synthetic demonstration data. Brand names, company names and all values are invented for this prototype and do not represent any real company, product or market.',
      'Molecule names are real generic ingredients; their association with these invented brands is fictional.',
    ],
  });
}
