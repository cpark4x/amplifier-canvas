import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        input: {
          index: './src/main/index.ts',
          'stats-worker': './src/main/stats-worker.ts',
        },
        external: ['node-pty', 'better-sqlite3'],
        output: {
          entryFileNames: '[name].js',
        },
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: './src/renderer/index.html'
      }
    }
  }
})
