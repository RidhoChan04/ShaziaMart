import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { isOwnerPath, shouldRegisterPwa } from "./app/pwa";
import "./app/styles.css";

async function enableMocking(): Promise<void> {
  if (!(import.meta.env.DEV || import.meta.env.VITE_MOCK === "1")) return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
}

/**
 * SW PWA (scope `/owner/`) hanya di build produksi tanpa mock, dan hanya dari
 * halaman pemilik: mode autoUpdate me-reload halaman saat SW diperbarui, dan
 * layar kasir tidak boleh ikut ter-reload. Di build mock/dev plugin PWA
 * dimatikan (lihat vite.config.ts) sehingga `registerSW` juga no-op.
 */
function registerPwa(): void {
  if (!shouldRegisterPwa(import.meta.env)) return;
  if (!isOwnerPath(window.location.pathname)) return;
  registerSW({
    immediate: true,
    onNeedReload() {
      if (isOwnerPath(window.location.pathname)) window.location.reload();
    },
  });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Elemen #root tidak ditemukan");
}

enableMocking().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  registerPwa();
});
