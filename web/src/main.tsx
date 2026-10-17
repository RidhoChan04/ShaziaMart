import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import "./app/styles.css";

async function enableMocking(): Promise<void> {
  if (!(import.meta.env.DEV || import.meta.env.VITE_MOCK === "1")) return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
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
});
