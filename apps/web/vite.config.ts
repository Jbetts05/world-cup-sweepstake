import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    hmr: false,
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@world-cup/shared/fixtures/mockState',
        replacement: fileURLToPath(
          new URL('../../packages/shared/src/fixtures/mockState.ts', import.meta.url),
        ),
      },
      {
        find: '@world-cup/shared',
        replacement: fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    ],
  },
})
