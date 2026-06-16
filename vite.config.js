import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Tách các thư viện nặng thành chunk riêng → tải song song + browser cache lại
        // (không phải tải lại khi deploy bản mới nếu thư viện không đổi)
        manualChunks: {
          recharts: ['recharts'],
          xlsx: ['xlsx', 'xlsx-js-style'],
          'google-ai': ['@google/generative-ai'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/bluecore-api': {
        target: 'https://admin-apis.bluecore.vn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bluecore-api/, ''),
      },
      '/api': {
        target: 'https://koc-tool.vercel.app',
        changeOrigin: true,
      },
    }
  }
})
