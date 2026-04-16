import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Main process tests — pure Node, no Electron
    environment: 'node',
    testTimeout: 30_000, // streamSessionStats can be slow on large fixtures
  },
})