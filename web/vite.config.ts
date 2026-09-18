import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5175,
    fs: { allow: ['..'] },
    // Same-origin proxy to the local Bee node so the viewer can read feed headers.
    proxy: {
      '/bee': { target: 'http://127.0.0.1:1633', changeOrigin: true, rewrite: (p) => p.replace(/^\/bee/, '') },
    },
  },
  preview: {
    port: 5175,
    proxy: {
      '/bee': { target: 'http://127.0.0.1:1633', changeOrigin: true, rewrite: (p) => p.replace(/^\/bee/, '') },
    },
  },
})
