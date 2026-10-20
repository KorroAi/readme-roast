import { defineConfig } from '@playwright/test';

// Two e2e runs can share the machine: DD_E2E_PORT picks the preview port, and any port other than
// the default builds into its own directory so the runs never overwrite each other's dist/.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PORT = Number(env.DD_E2E_PORT ?? 4173);
const OUT = PORT === 4173 ? 'dist' : `.e2e-dist-${PORT}`;

// End-to-end tests run the production build in headless Chromium with real WebGL 2 (SwiftShader), in portrait on
// the reference phone (390 × 844, SPEC §13.2). Touch goes through CDP (tests/e2e/touch.ts), so every tap is real.
// DPR 1 keeps SwiftShader's frame rate usable; captures at DPR 2 use tools/capture.mjs.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: PORT === 4173 ? 'test-results' : `test-results-${PORT}`,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite build --logLevel error --outDir ${OUT} && npx vite preview --port ${PORT} --strictPort --outDir ${OUT}`,
    url: `http://localhost:${PORT}/index.html`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
