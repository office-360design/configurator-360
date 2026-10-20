import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    // shared-3d lives outside this package, so its bare imports cannot find
    // this sibling node_modules by walking up from the importing file.
    // Bind the editor, AR snapshot and exporters to Pergola's locked Three.js.
    alias: [
      { find: /^three$/, replacement: fileURLToPath(new URL('./node_modules/three/build/three.module.js', import.meta.url)) },
      { find: /^three\/addons\//, replacement: fileURLToPath(new URL('./node_modules/three/examples/jsm/', import.meta.url)) },
      { find: /^three\/examples\/jsm\//, replacement: fileURLToPath(new URL('./node_modules/three/examples/jsm/', import.meta.url)) },
    ],
    dedupe: ['three'],
  },
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
