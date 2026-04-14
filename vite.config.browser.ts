/**
 * Vite config for browser dev mode.
 *
 * Serves ONLY the renderer as a plain web app — no Electron, no main process.
 * The mock electronAPI is injected via a simple import in the entry HTML.
 *
 * Usage:  npm run dev:browser  →  opens http://localhost:5188
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5188,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, 'out/browser'),
  },
  define: {
    // Signal to code that we're in browser dev mode
    'import.meta.env.BROWSER_DEV': JSON.stringify(true),
  },
})