import { defineConfig } from '@playwright/test';

// End-to-end tests run the production build in headless Chromium with real WebGL 2
// (SwiftShader). Touch is emulated through CDP so the mobile controls are exercised.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 915, height: 412 },
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
    command: 'npx vite build --logLevel error && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/index.html',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
