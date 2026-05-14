import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5177',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'dashboard',
      use: { baseURL: 'http://localhost:5177' },
      testMatch: /dashboard\/.*/,
    },
    {
      name: 'pwaMenu',
      use: { baseURL: 'http://localhost:5176' },
      testMatch: /pwa-menu\/.*/,
    },
    {
      name: 'pwaWaiter',
      use: { baseURL: 'http://localhost:5178' },
      testMatch: /pwa-waiter\/.*/,
    },
  ],
  webServer: [
    {
      command: 'cd Dashboard && npm run dev',
      port: 5177,
      reuseExistingServer: true,
    },
    {
      command: 'cd pwaMenu && npm run dev',
      port: 5176,
      reuseExistingServer: true,
    },
    {
      command: 'cd pwaWaiter && npm run dev',
      port: 5178,
      reuseExistingServer: true,
    },
  ],
})
