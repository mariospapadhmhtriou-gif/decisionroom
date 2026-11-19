import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * Runs specs against a deployed app instead of a local dev server.
 *   DR_BASE_URL=https://decision-room.app.space npx playwright test -c tests/playwright.live.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'isolation.spec.ts',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: process.env.DR_BASE_URL ?? 'https://decision-room.app.space',
    headless: true,
    launchOptions: chromiumLaunchOptions(),
  },
})
