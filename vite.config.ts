import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Remove a lista de sufixos públicos (~185 kB) puxada pelo tough-cookie do MSW.
      { find: /^tldts$/, replacement: fileURLToPath(new URL('./src/mocks/shims/tldts.ts', import.meta.url)) },
    ],
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/msw') || id.includes('@mswjs')) return 'mocks'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react'
          if (id.includes('@tanstack')) return 'tanstack'
          return undefined
        },
      },
    },
  },
})
