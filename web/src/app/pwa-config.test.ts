import { expect, test } from "vitest";
import { isOwnerPath, shouldRegisterPwa } from "./pwa";
import { pwaOptions } from "./pwa-options";

test("SW PWA tidak didaftarkan saat mock", () => {
  expect(shouldRegisterPwa({ DEV: true, VITE_MOCK: undefined })).toBe(false);
  expect(shouldRegisterPwa({ DEV: false, VITE_MOCK: "1" })).toBe(false);
  expect(shouldRegisterPwa({ DEV: true, VITE_MOCK: "1" })).toBe(false);
  expect(shouldRegisterPwa({ DEV: false, VITE_MOCK: undefined })).toBe(true);
  expect(shouldRegisterPwa({ DEV: false, VITE_MOCK: "0" })).toBe(true);
});

test("konfigurasi manifest dan SW", () => {
  expect(pwaOptions.manifest).toMatchObject({
    name: "ShaziaMart Pemilik",
    short_name: "ShaziaMart",
    start_url: "/owner/",
    scope: "/owner/",
    display: "standalone",
    theme_color: "#1f7a4d",
    background_color: "#f6f7f5",
    lang: "id",
  });
  expect(pwaOptions.scope).toBe("/owner/");
  expect(pwaOptions.injectRegister).toBeNull();
  expect(pwaOptions.workbox?.navigateFallback).toBe("/index.html");
  expect(
    pwaOptions.workbox?.navigateFallbackDenylist?.some((r) =>
      r.test("/api/health"),
    ),
  ).toBe(true);
  expect(pwaOptions.workbox?.runtimeCaching ?? []).toHaveLength(0);
});

test("manifest memuat ikon 192, 512, dan maskable", () => {
  const icons =
    pwaOptions.manifest && "icons" in pwaOptions.manifest
      ? (pwaOptions.manifest.icons ?? [])
      : [];
  const sizes = icons.map((i) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
});

test("registrasi dibatasi ke halaman pemilik", () => {
  expect(isOwnerPath("/owner")).toBe(true);
  expect(isOwnerPath("/owner/")).toBe(true);
  expect(isOwnerPath("/owner/barang")).toBe(true);
  expect(isOwnerPath("/kasir")).toBe(false);
  expect(isOwnerPath("/ownerku")).toBe(false);
  expect(isOwnerPath("/")).toBe(false);
});
