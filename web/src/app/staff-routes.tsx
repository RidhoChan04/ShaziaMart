import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root-route";

// Satu modul masuk untuk seluruh app orang toko, sehingga staf tetap satu chunk.
const loadStaff = () => import("@/features/staff");

// App HP orang toko (realm `/api/staff`).
const staffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "staff",
  component: lazyRouteComponent(loadStaff, "StaffLayout"),
});

const staffIndexRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "/",
  component: lazyRouteComponent(loadStaff, "StaffBerandaPage"),
});

const staffMasukRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "masuk",
  component: lazyRouteComponent(loadStaff, "MasukPage"),
});

const staffMasukBaruRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "masuk/baru",
  validateSearch: (
    search: Record<string, unknown>,
  ): { draf?: string; langkah?: "bayar" } => ({
    ...(typeof search.draf === "string" && search.draf
      ? { draf: search.draf }
      : {}),
    ...(search.langkah === "bayar" ? { langkah: "bayar" as const } : {}),
  }),
  component: lazyRouteComponent(loadStaff, "ReceiptFormPage"),
});

const staffMasukDetailRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "masuk/$receiptId",
  component: lazyRouteComponent(loadStaff, "ReceiptEditPage"),
});

const staffOpnameRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "opname",
  component: lazyRouteComponent(loadStaff, "OpnamePage"),
});

const staffOpnameHitungRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "opname/hitung",
  validateSearch: (search: Record<string, unknown>): { draf: string } => ({
    draf: typeof search.draf === "string" ? search.draf : "",
  }),
  component: lazyRouteComponent(loadStaff, "CountPage"),
});

const staffOpnameHasilRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "opname/$sessionId",
  component: lazyRouteComponent(loadStaff, "OpnameResultPage"),
});

const staffKedaluwarsaRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "kedaluwarsa",
  component: lazyRouteComponent(loadStaff, "ExpiryPage"),
});

const staffMenipisRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "menipis",
  component: lazyRouteComponent(loadStaff, "LowStockPage"),
});

const staffLainnyaRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "lainnya",
  component: lazyRouteComponent(loadStaff, "StaffLainnyaPage"),
});

/** Pohon rute app HP orang toko (`/staff`). */
export const staffTree = staffRoute.addChildren([
  staffIndexRoute,
  staffMasukRoute,
  staffMasukBaruRoute,
  staffMasukDetailRoute,
  staffOpnameRoute,
  staffOpnameHitungRoute,
  staffOpnameHasilRoute,
  staffKedaluwarsaRoute,
  staffMenipisRoute,
  staffLainnyaRoute,
]);
