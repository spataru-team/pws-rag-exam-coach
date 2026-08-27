/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'PWS RAG Exam Coach',
        short_name: 'PWS Coach',
        description:
          'Local-first multilingual adaptive RAG learning app for exam preparation.',
        theme_color: '#1f6feb',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Subject data packs (public/packs/*.pack.json) are fetched on demand
        // and cached at runtime (below), NOT precached on install — some now
        // run into the tens of MB (auto-ingested from full textbooks), and
        // eagerly downloading every subject's pack on first install would be
        // both a slow/expensive first load and pointless (a student only
        // studies 1-2 subjects). `json` was previously in globPatterns, which
        // pulled pack files into precache anyway once they were small; now
        // excluded so only the runtimeCaching rule ever touches them.
        //
        // Exam/textbook figure PNGs (public/assets/**, see src/types/asset.ts
        // and scripts/extract-figures.ts) get the same treatment and for the
        // same reason: `png` is in globPatterns for the app's own small UI
        // assets, but figures are fetched per-exam/per-topic on demand, not on
        // every install.
        globIgnores: ['assets/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/packs/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'subject-packs',
              expiration: { maxEntries: 32 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'figures',
              expiration: { maxEntries: 300 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
