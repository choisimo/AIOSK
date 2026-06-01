import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          state: ['@reduxjs/toolkit', 'react-redux', '@tanstack/react-query'],
          motion: ['framer-motion'],
          vendor: ['axios']
        }
      }
    }
  }
})
