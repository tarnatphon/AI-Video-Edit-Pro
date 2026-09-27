import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite configuration.
 *
 * - Binds to 0.0.0.0 so the dev server is reachable from iPad / Android on the same Wi-Fi.
 * - `allowedHosts: true` lets reverse proxies / tunnels (e.g. preview hosts) reach the dev server.
 * - `VITE_HTTPS=1 npm run dev` enables a self-signed certificate. HTTPS is required for
 *   secure-context APIs (OPFS, WebCodecs) when the app is NOT opened via localhost.
 */
export default defineConfig(() => {
  const useHttps = process.env.VITE_HTTPS === '1';

  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'AI Video Edit Pro',
        short_name: 'VideoEditPro',
        description: 'Professional multi-track video editor that runs in your browser on Mac, Windows, iPad and Android.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ];

  if (useHttps) plugins.push(basicSsl());

  return {
    plugins,
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      allowedHosts: true as const,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true as const,
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
  };
});
