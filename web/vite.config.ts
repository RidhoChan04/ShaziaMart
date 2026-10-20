/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { shouldRegisterPwa } from "./src/app/pwa.ts";
import { pwaOptions } from "./src/app/pwa-options.ts";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Build mock/dev tidak menghasilkan SW maupun manifest, dan `virtual:pwa-register`
  // menjadi no-op: SW scope `/owner/` tidak boleh merebut kendali dari MSW.
  if (command === "build" && mode === "production" && env.VITE_MOCK === "1") {
    throw new Error(
      "VITE_MOCK=1 tidak boleh dipakai untuk build produksi — gunakan npm run build:mock",
    );
  }
  const pwaEnabled = shouldRegisterPwa({
    DEV: command === "serve",
    VITE_MOCK: env.VITE_MOCK,
  });

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({ ...pwaOptions, disable: !pwaEnabled }),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      exclude: ["e2e/**", "node_modules/**"],
      // Test integrasi layar kasir (render penuh + MSW) bisa > 5 dtk saat semua worker
      // mulai bersamaan di mesin sibuk; 15 dtk tetap menangkap test yang benar-benar macet.
      testTimeout: 15_000,
    },
  };
});
