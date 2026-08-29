import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from /<repo>/, so built assets must be
  // requested from there rather than the domain root. The deploy workflow sets
  // VITE_BASE from the repository name, so renaming the repo does not break it.
  // Local development and any root-hosted deployment keep '/'.
  base: process.env.VITE_BASE || '/',
  server: { port: 5173, open: false },
  build: { outDir: 'dist', sourcemap: false },
});
