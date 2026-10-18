import { defineConfig, type Plugin } from 'vite';
import { en } from './src/i18n/en';

const entry = (file: string) => decodeURIComponent(new URL(file, import.meta.url).pathname);

// Relative base so the same build runs from a web server, file:// and the Android WebView asset loader.
/** Fill %DD_key% placeholders in HTML from the string table (for text shown before any module runs). */
function htmlStrings(): Plugin {
  const table: Record<string, string> = { DD_WEBVIEW_OUTDATED: en['error.webviewOutdated'] };
  return {
    name: 'dd-html-strings',
    transformIndexHtml: (html) => html.replace(/%(DD_[A-Z_]+)%/g, (m, k: string) => table[k] ?? m),
  };
}

export default defineConfig({
  base: './',
  plugins: [htmlStrings()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: entry('index.html'),
        visuallab: entry('visuallab.html'),
        // The UI sandbox doubles as the Visual Lab's "UI Readability" view.
        uilab: entry('src/ui/dev/sandbox.html'),
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
