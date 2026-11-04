import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path pour GitHub Pages : https://<user>.github.io/soma/
// Surchageable via VITE_BASE (ex. '/' pour un domaine perso).
const base = process.env.VITE_BASE ?? '/soma/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
      manifest: {
        id: base,
        name: 'Soma — Suivi sportif & récupération',
        short_name: 'Soma',
        description:
          "Suivi sportif, santé et récupération. Corps 3D, charge, sommeil, objectifs. 100 % local.",
        lang: 'fr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#04070d',
        theme_color: '#04070d',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('@react-three') || id.includes('postprocessing'))
              return 'three'
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('@supabase')) return 'supabase'
          }
        },
      },
    },
  },
})
