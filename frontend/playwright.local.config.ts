import { defineConfig } from '@playwright/test';

// Deliberately separate from the hosted-account suite. Start the local API and
// Vite first; synthetic accounts are created only on loopback.
const webURL = process.env.PAYDRIFT_LOCAL_WEB_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(webURL).hostname)) {
  throw new Error('Local stability tests must use a loopback frontend');
}

export default defineConfig({
  testDir: './e2e-local',
  outputDir: '/tmp/paydrift-local-browser-results',
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: webURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
});
