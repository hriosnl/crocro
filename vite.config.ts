import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import webExtension from 'vite-plugin-web-extension'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

// Plugin to copy icons during build
const copyIconsPlugin = () => ({
  name: 'copy-icons',
  closeBundle() {
    const iconsDir = resolve(__dirname, 'icons')
    const distDir = resolve(__dirname, 'dist/icons')
    
    // Create dist/icons directory if it doesn't exist
    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true })
    }
    
    // Copy icon files
    const iconFiles = ['icon-16.png', 'icon-48.png', 'icon-128.png']
    iconFiles.forEach(file => {
      const src = resolve(iconsDir, file)
      const dest = resolve(distDir, file)
      if (existsSync(src)) {
        copyFileSync(src, dest)
        console.log(`Copied ${file} to dist/icons/`)
      }
    })
  }
})

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: './src/manifest.json'
    }),
    copyIconsPlugin()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})