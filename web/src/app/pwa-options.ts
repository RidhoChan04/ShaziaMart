import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * Opsi vite-plugin-pwa untuk aplikasi pemilik. Dipisah dari `vite.config.ts`
 * agar bisa diuji; hanya import tipe sehingga aman dimuat di Vitest (jsdom).
 *
 * SW hanya meng-cache cangkang aplikasi (precache); data selalu langsung dari
 * server, jadi tidak ada runtime caching dan `/api/` tidak pernah di-fallback.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "autoUpdate",
  injectRegister: null,
  // Ikon manifest sudah tercakup globPatterns; hindari entri precache ganda.
  includeManifestIcons: false,
  scope: "/owner/",
  manifest: {
    id: "/owner/",
    name: "ShaziaMart Pemilik",
    short_name: "ShaziaMart",
    start_url: "/owner/",
    scope: "/owner/",
    display: "standalone",
    theme_color: "#1f7a4d",
    background_color: "#f6f7f5",
    lang: "id",
    icons: [
      { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,woff2,svg,png}"],
    globIgnores: ["mockServiceWorker.js"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api\//],
  },
  devOptions: { enabled: false },
};
