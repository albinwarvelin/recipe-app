import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Recept',
        short_name: 'Recept',
        description: 'Ett privat receptbibliotek som fungerar offline.',
        theme_color: '#ffffff',
        background_color: '#f5f7fb',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        // The lazy HEIC decoder is intentionally cached so Apple photo imports
        // still work after the PWA has been opened once and then goes offline.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  server: {
    port: 5173
  }
});
