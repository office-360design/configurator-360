import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 4173,
    open: true,
  },
  preview: {
    port: 4173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
