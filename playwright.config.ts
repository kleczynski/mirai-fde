import { defineConfig } from '@playwright/test';
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const ci = Boolean(process.env.CI);
export default defineConfig({
  testDir: './tests/e2e',
  // Multi-step scenarios (consent -> interview -> reload -> corrections -> save
  // -> export -> deletion) can exceed the 30s default on shared, slower CI
  // runners even though they pass comfortably on a local machine. Give CI more
  // headroom and one retry for a genuinely flaky run, without hiding a real
  // regression (still fails after retries are exhausted).
  timeout: ci ? 60_000 : 30_000,
  retries: ci ? 1 : 0,
  use: { baseURL: externalBaseUrl ?? 'http://localhost:5173', headless: true },
  webServer: externalBaseUrl ? undefined : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 900 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }],
});
