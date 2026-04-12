/// <reference types="node" />

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['real-backend.spec.ts', 'performance-50.spec.ts'],
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:8011',
    headless: true,
  },
  webServer: {
    command: 'cmd /c "set PORT=8011&&set UMI_APP_USE_MOCK=false&&set UMI_APP_WS_BASE_URL=ws://127.0.0.1:8080/ws/v1&&npm run dev"',
    url: 'http://127.0.0.1:8011',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  reporter: 'list',
});