import { defineConfig } from '@playwright/test';

// E2E tests run against the standalone Vite dev server. Playwright starts it
// automatically via the webServer config below, so no manual step is needed.
// Run with: npx playwright test
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  reporter: [
    ['list'],
    ['./reporters/flatArtifactReporter.cjs'],
  ],
  projects: [
    {
      name: 'knitstitch',
      testIgnore: '**/sketchConstraints*.spec.js',
      outputDir: './test-results',
      use: {
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'knitstitch-constraints',
      testMatch: '**/sketchConstraints*.spec.js',
      outputDir: './test-results-constraints',
      use: {
        screenshot: 'on',
        trace: 'on',
      },
    },
  ],
});
