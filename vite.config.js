import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        brand: resolve(__dirname, 'brand.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,  // espone su 0.0.0.0 → accessibile da altri dispositivi in rete
  }
})
