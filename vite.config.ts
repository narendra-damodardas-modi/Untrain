import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/files': 'http://127.0.0.1:8787',
    },
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/files': 'http://127.0.0.1:8787',
    },
  },
})
