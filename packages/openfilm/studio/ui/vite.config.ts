import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { workbenchImportMap, workbenchInputs } from './workbenches';
import { browserBuild } from './browser-build';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/* Studio's editor: built once into dist/ and served by Studio's own server (studio/server/server.mjs), with the
   workbenches of OpenFilm's own plugins as entries of their own (workbenches.ts) */
export default defineConfig(({mode}) => ({
  root: __dirname,
  plugins: [react(), tailwind(), workbenchImportMap(), ...(mode==='browser'?[browserBuild()]:[])],
  define: {'import.meta.env.VITE_BROWSER_LOCAL':JSON.stringify(mode==='browser'?'1':'0'),'import.meta.env.VITE_BROWSER_BUILD':JSON.stringify(Date.now().toString())},
  resolve: { alias: { '@': at('./src') } },
  build: {
    outDir: mode==='browser'?'dist-browser':'dist', emptyOutDir: true, target: 'es2022', sourcemap: false,
    /* a workbench's entry keeps what it exports (its element): it is imported by name, from outside the build */
    rollupOptions: { preserveEntrySignatures: 'exports-only', input: { main: at('./index.html'), ...workbenchInputs(),...(mode==='browser'?{'browser-sw':at('./src/browser/service-worker.ts')}:{}) },output:{entryFileNames:chunk=>chunk.name==='browser-sw'?'browser-sw.js':'assets/[name]-[hash].js'} },
  },
}));
