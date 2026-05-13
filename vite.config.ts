import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/office-agent/',
  plugins: [react()],
  server: {
    proxy: {
      '/office-agent/api': {
        target: 'http://localhost:8788',
        rewrite: (path) => path.replace(/^\/office-agent/, ''),
      },
    },
  },
})
