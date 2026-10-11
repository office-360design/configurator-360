import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  server: {
    port: 4173,
    open: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
  preview: {
    port: 4173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // AR landing page is bundled independently: no editor, login or Three.js
    // download is needed on the phone before launching its native viewer.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        ar: fileURLToPath(new URL('./ar.html', import.meta.url)),
      },
    },
  },
});
