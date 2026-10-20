import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { en } from './src/i18n/en';
import { bootMarkSvg, emblemSvg } from './src/ui/brand/emblem.mjs';
// @ts-expect-error plain ES module shared with android/build-apk.sh (no type declarations)
import { iconPng } from './android/make-icon.mjs';
import { readVersion } from './tools/version.mjs';

const entry = (file: string) => decodeURIComponent(new URL(file, import.meta.url).pathname);
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
/** DD_RELEASE=1: the shipped build, index.html only (no Visual Lab, no UI sandbox). */
const RELEASE = env.DD_RELEASE === '1';

type Version = { version: string; build: number; versionCode: number };
/** node:fs, imported at config time (the project has no Node type declarations). */
type Fs = { readFileSync(path: string, encoding: 'utf8'): string };
const NODE_FS: string = 'node:fs';
let readFileSync: Fs['readFileSync'] = () => {
  throw new Error('vite.config: node:fs is loaded by the config function');
};

// Relative base so the same build runs from a web server, file:// and the Android WebView asset loader.
/**
 * Fill %DD_key% placeholders in HTML from the string table (for text shown before any module
 * runs) and the boot mark (the emblem as inline SVG, from the same geometry as the launcher).
 */
function htmlStrings(): Plugin {
  const table: Record<string, string> = { DD_WEBVIEW_OUTDATED: en['error.webviewOutdated'], DD_BOOT_MARK: bootMarkSvg({ size: 112 }) };
  return {
    name: 'dd-html-strings',
    transformIndexHtml: (html) => html.replace(/%(DD_[A-Z_]+)%/g, (m, k: string) => table[k] ?? m),
  };
}

/** Serve generated files in dev and emit them into the build (shared by the plugins below). */
function generatedFiles(name: string, files: Record<string, () => Uint8Array | string>): Pick<Plugin, 'name' | 'configureServer' | 'generateBundle'> {
  const types: Record<string, string> = {
    webmanifest: 'application/manifest+json',
    png: 'image/png',
    svg: 'image/svg+xml',
    txt: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    json: 'application/json',
  };
  return {
    name,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = ((req as { url?: string }).url ?? '').split('?')[0].replace(/^.*\//, '');
        const make = files[file];
        if (!make) return next();
        res.setHeader('Content-Type', types[file.split('.').pop() ?? ''] ?? 'application/octet-stream');
        res.end(make());
      });
    },
    generateBundle() {
      for (const [fileName, make] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: make() });
    },
  };
}

/**
 * Web app manifest and icons, generated from the same procedural emblem as the Android launcher:
 * "Add to Home Screen" then opens the game fullscreen and upright, like the APK. "any" icons are
 * the rounded tile (transparent corners); "maskable" ones are full-bleed with the emblem inside
 * the adaptive safe circle (61 % of the width, within the 80 % maskable zone), so no platform
 * mask cuts the lantern. The SVG favicon is the emblem itself.
 */
function webApp(): Plugin {
  const manifest = JSON.stringify({
    name: en['game.title'],
    short_name: en['game.title'],
    description: en['game.tagline'],
    start_url: './index.html',
    scope: './',
    display: 'fullscreen',
    orientation: 'portrait',
    background_color: '#070a0f',
    theme_color: '#070a0f',
    icons: [
      ...[192, 512].map((n) => ({ src: `./icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' })),
      ...[192, 512].map((n) => ({ src: `./icon-maskable-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'maskable' })),
    ],
  });
  return {
    ...generatedFiles('dd-web-app', {
      'manifest.webmanifest': () => manifest,
      'icon-192.png': () => iconPng(192, true),
      'icon-512.png': () => iconPng(512, true),
      'icon-maskable-192.png': () => iconPng(192, false),
      'icon-maskable-512.png': () => iconPng(512, false),
      'apple-touch-icon.png': () => iconPng(180, false),
      'favicon.svg': () => emblemSvg({ size: 64, glow: false, idPrefix: 'f' }),
    }),
    transformIndexHtml: (html) =>
      html.includes('<title>DEEP DOWN</title>')
        ? html.replace(
            '</title>',
            '</title>\n    <link rel="manifest" href="./manifest.webmanifest" />\n    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />\n    <link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png" />\n    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />',
          )
        : html,
  };
}

const fill = (s: string, params: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => params[k] ?? m);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pkgVersion = (name: string) => (JSON.parse(readFileSync(entry(`node_modules/${name}/package.json`), 'utf8')) as { version: string }).version;

/** dist/licenses.txt: the third-party notices the build must carry (three.js, Vite's helpers). */
export function licensesText(): string {
  const three = readFileSync(entry('node_modules/three/LICENSE'), 'utf8').trim();
  // Vite's own MIT notice is the first section of its LICENSE.md (the rest covers its dev-only dependencies).
  const viteLicense = readFileSync(entry('node_modules/vite/LICENSE.md'), 'utf8');
  const vite = viteLicense.slice(0, viteLicense.indexOf('# Licenses of bundled dependencies')).replace(/^# Vite core license\s*/, '').trim();
  const rule = '-'.repeat(72);
  return [
    en['release.licenses.title'],
    '',
    en['release.licenses.intro'],
    '',
    rule,
    fill(en['release.licenses.three'], { version: pkgVersion('three') }),
    rule,
    three,
    '',
    rule,
    fill(en['release.licenses.vite'], { version: pkgVersion('vite') }),
    rule,
    vite,
    '',
  ].join('\n');
}

/** dist/privacy.html: self-contained (no scripts, no external files), readable offline and hosted. */
export function privacyHtml(version: string): string {
  const sections: Array<[keyof typeof en, keyof typeof en]> = [
    ['release.privacy.networkTitle', 'release.privacy.network'],
    ['release.privacy.storageTitle', 'release.privacy.storage'],
    ['release.privacy.backupTitle', 'release.privacy.backup'],
    ['release.privacy.permissionsTitle', 'release.privacy.permissions'],
    ['release.privacy.crashTitle', 'release.privacy.crash'],
    ['release.privacy.childrenTitle', 'release.privacy.children'],
    ['release.privacy.changesTitle', 'release.privacy.changes'],
    ['release.privacy.contactTitle', 'release.privacy.contact'],
  ];
  const body = sections.map(([h, p]) => `    <h2>${esc(en[h])}</h2>\n    <p>${esc(en[p])}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(en['release.privacy.pageTitle'])}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #05080c; color: #e8eef6; font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
      main { max-width: 40rem; margin: 0 auto; padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 48px max(20px, env(safe-area-inset-left)); }
      .game { margin: 0; color: #ffb35c; font-size: 13px; font-weight: 700; letter-spacing: 0.24em; }
      h1 { margin: 4px 0 16px; font-size: 28px; }
      .summary { font-size: 18px; color: #fff; }
      h2 { margin: 28px 0 6px; font-size: 17px; color: #5ff0ff; }
      p { margin: 0; color: #c9d4e2; }
      footer { margin-top: 36px; color: #93a1b5; font-size: 14px; }
    </style>
  </head>
  <body>
  <main>
    <p class="game">${esc(en['game.title'])}</p>
    <h1>${esc(en['release.privacy.heading'])}</h1>
    <p class="summary">${esc(en['release.privacy.summary'])}</p>
${body}
    <footer>${esc(fill(en['release.privacy.version'], { version }))}</footer>
  </main>
  </body>
</html>
`;
}

/** licenses.txt, privacy.html and version.json (read by build-apk.sh and Gradle's stale check). */
function releaseFiles(v: Version): Plugin {
  return generatedFiles('dd-release-files', {
    'licenses.txt': () => licensesText(),
    'privacy.html': () => privacyHtml(v.version),
    'version.json': () => JSON.stringify({ ...v, release: RELEASE }),
  });
}

export default defineConfig(async (): Promise<UserConfig> => {
  readFileSync = ((await import(/* @vite-ignore */ NODE_FS)) as Fs).readFileSync;
  const v: Version = await readVersion();
  return {
    base: './',
    plugins: [htmlStrings(), webApp(), releaseFiles(v)],
    define: {
      __DD_VERSION__: JSON.stringify(v.version),
      __DD_BUILD__: JSON.stringify(v.build),
      __DD_VERSION_CODE__: JSON.stringify(v.versionCode),
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: RELEASE
          ? { main: entry('index.html') }
          : {
              main: entry('index.html'),
              visuallab: entry('visuallab.html'),
              // The UI sandbox doubles as the Visual Lab's "UI Readability" view.
              uilab: entry('src/ui/dev/sandbox.html'),
            },
      },
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
