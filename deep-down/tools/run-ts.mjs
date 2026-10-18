// Load a TypeScript module from src/ through Vite's SSR loader and run its default export.
// Usage: node tools/run-ts.mjs tools/some-script.ts [args...]
import { createServer } from 'vite';

const [, , entry, ...args] = process.argv;
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const mod = await server.ssrLoadModule(entry.startsWith('/') ? entry : `/${entry}`);
  await mod.default(args);
} finally {
  await server.close();
}
