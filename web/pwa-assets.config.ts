import {
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // Ikon maskable dipotong OS; latar hijau penuh agar tidak ada tepi putih.
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: "#1f7a4d" },
    },
  },
  images: ["public/icon.svg"],
});
