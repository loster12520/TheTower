/// <reference types="node" />

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['real-backend.spec.ts', 'performance-50.spec.ts'],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8010',
    headless: true,
  },
  webServer: {
    command: 'cmd /c "set PORT=8010&&set UMI_APP_USE_MOCK=true&&npm run dev"',
    url: 'http://127.0.0.1:8010',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  reporter: 'list',
});
