import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Recipe App',
        short_name: 'Recipes',
        description: 'A private, local-first recipe library.',
        theme_color: '#f7f7f8',
        background_color: '#f7f7f8',
        display: 'standalone',
        start_url: '/',
        icons: []
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: []
      }
    })
  ],
  server: {
    port: 5173
  }
});
