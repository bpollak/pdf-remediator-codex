import { defineConfig, devices } from '@playwright/test';

/**
 * Regression run against the deployed Vercel production site.
 *
 * Run:
 *   npx playwright test --config playwright.live.config.ts
 */
export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  timeout: 240_000,
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? 'https://pdf-remediator-codex.vercel.app',
    trace: 'retain-on-failure',
    // Sandboxed egress proxies re-sign TLS with a CA Chromium does not trust.
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
