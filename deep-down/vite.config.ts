import { defineConfig } from 'vite';

const entry = (file: string) => decodeURIComponent(new URL(file, import.meta.url).pathname);

// Relative base so the same build runs from a web server, file:// and the Android WebView asset loader.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: entry('index.html'),
        visuallab: entry('visuallab.html'),
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
