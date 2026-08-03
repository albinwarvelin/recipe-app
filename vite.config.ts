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
        // The complete deployment is protected by Cloudflare Access. HTML
        // navigations must reach Access so it can issue/refresh authorization
        // cookies; a cached SPA shell would mask the login page.
        navigateFallback: null,
        globIgnores: ['**/index.html'],
        cleanupOutdatedCaches: true,
        runtimeCaching: []
      }
    })
  ],
  server: {
    port: 5173
  }
});
