import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Skip DTS for now - SDK types are complex
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'node18',
  outDir: 'dist',
});
