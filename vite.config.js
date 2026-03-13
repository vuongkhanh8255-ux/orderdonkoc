import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bluecore-api': {
        target: 'https://admin-apis.bluecore.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bluecore-api/, ''),
      }
    }
  }
})
