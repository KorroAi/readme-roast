import { defineConfig, type Plugin } from 'vite';
import { en } from './src/i18n/en';
// @ts-expect-error plain ES module shared with android/build-apk.sh (no type declarations)
import { iconPng } from './android/make-icon.mjs';

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

/**
 * Web app manifest and icons, generated from the same procedural icon as the Android launcher:
 * "Add to Home Screen" then opens the game fullscreen in landscape, like the APK.
 */
function webApp(): Plugin {
  const manifest = JSON.stringify({
    name: en['game.title'],
    short_name: en['game.title'],
    description: en['game.tagline'],
    start_url: './index.html',
    scope: './',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#05080c',
    theme_color: '#05080c',
    icons: [192, 512].map((n) => ({ src: `./icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any maskable' })),
  });
  const files: Record<string, () => Uint8Array | string> = {
    'manifest.webmanifest': () => manifest,
    'icon-192.png': () => iconPng(192, false),
    'icon-512.png': () => iconPng(512, false),
    'apple-touch-icon.png': () => iconPng(180, false),
  };
  const types: Record<string, string> = { webmanifest: 'application/manifest+json', png: 'image/png' };
  return {
    name: 'dd-web-app',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = ((req as { url?: string }).url ?? '').split('?')[0].replace(/^.*\//, '');
        const make = files[name];
        if (!make) return next();
        res.setHeader('Content-Type', types[name.split('.').pop() ?? ''] ?? 'application/octet-stream');
        res.end(make());
      });
    },
    generateBundle() {
      for (const [fileName, make] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: make() });
    },
    transformIndexHtml: (html) =>
      html.includes('<title>DEEP DOWN</title>')
        ? html.replace('</title>', '</title>\n    <link rel="manifest" href="./manifest.webmanifest" />\n    <link rel="icon" href="./icon-192.png" />\n    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />')
        : html,
  };
}

export default defineConfig({
  base: './',
  plugins: [htmlStrings(), webApp()],
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
