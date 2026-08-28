/**
 * Bundles the TypeScript verification harness with esbuild (already present as a
 * Vite dependency) and runs it on Node, so the real application modules are
 * tested rather than a reimplementation of them.
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'node_modules', '.matlens-verify');

mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'harness.mjs');

await build({
  entryPoints: [join(here, 'harness.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  external: ['papaparse', 'xlsx', 'jsdom', 'react', 'react-dom', 'react-dom/client', 'react-dom/server', 'react-dom/test-utils', 'react/jsx-runtime', 'recharts'],
  jsx: 'automatic',
  logLevel: 'warning',
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
