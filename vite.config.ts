/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Listen on IPv4 localhost: Node may otherwise pick IPv6 (::1) only, which
// `adb reverse` (phone testing over USB) can't reach.
const host = '127.0.0.1';

// GitHub Pages serves the app from a subfolder (/offline-travel-companion/); the deploy
// workflow sets BASE_PATH. Locally it's served from the root.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  server: { host },
  preview: { host },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Travel Companion',
        short_name: 'Trips',
        description: 'Offline guide to food, sights, transit, and weather for your trips.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f5f2',
        theme_color: '#0f766e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Trip photos. Prefetched when a trip is saved so they show offline.
            urlPattern: ({ url }) => url.hostname === 'upload.wikimedia.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
