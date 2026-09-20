import { defineConfig } from '@playwright/test';
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: externalBaseUrl ?? 'http://localhost:5173', headless: true },
  webServer: externalBaseUrl ? undefined : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 900 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }],
});
