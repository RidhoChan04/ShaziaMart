import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root-route";

// Satu modul masuk untuk seluruh app pemilik, sehingga owner tetap satu chunk.
const loadOwner = () => import("@/features/owner");

const ownerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "owner",
  component: lazyRouteComponent(loadOwner, "OwnerLayout"),
});

const ownerIndexRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "/",
  component: lazyRouteComponent(loadOwner, "BerandaPage"),
});

const ownerBarangRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "barang",
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    q?: string;
    kategori?: string;
    nonaktif?: true;
    menunggu?: true;
  } => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.kategori === "string" && search.kategori
      ? { kategori: search.kategori }
      : {}),
    ...(search.nonaktif === true || search.nonaktif === "true"
      ? { nonaktif: true as const }
      : {}),
    ...(search.menunggu === true || search.menunggu === "true"
      ? { menunggu: true as const }
      : {}),
  }),
  component: lazyRouteComponent(loadOwner, "BarangPage"),
});

// Sub-halaman Barang: komponen nyata menggantikan "Segera hadir" (Task 8, 9, 12).
const ownerBarangBaruRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "barang/baru",
  component: lazyRouteComponent(loadOwner, "ProductFormPage"),
});

const ownerBarangImporRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "barang/impor",
  component: lazyRouteComponent(loadOwner, "ImportPage"),
});

const ownerBarangDetailRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "barang/$productId",
  validateSearch: (
    search: Record<string, unknown>,
  ): { lembar?: "harga" | "habis" } =>
    search.lembar === "harga" || search.lembar === "habis"
      ? { lembar: search.lembar }
      : {},
  component: lazyRouteComponent(loadOwner, "ProductDetailPage"),
});

const ownerBarangUbahRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "barang/$productId/ubah",
  component: lazyRouteComponent(loadOwner, "ProductFormPage"),
});

const ownerLaporanRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan",
  component: lazyRouteComponent(loadOwner, "LaporanPage"),
});

const ownerKasbonRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "kasbon",
  component: lazyRouteComponent(loadOwner, "KasbonPage"),
});

const ownerLainnyaRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya",
  component: lazyRouteComponent(loadOwner, "LainnyaPage"),
});

const ownerBarangMasukRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/barang-masuk",
  component: lazyRouteComponent(loadOwner, "ReceiptsPage"),
});

const ownerBarangMasukDetailRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/barang-masuk/$receiptId",
  component: lazyRouteComponent(loadOwner, "ReceiptDetailPage"),
});

const ownerUtangRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/utang",
  component: lazyRouteComponent(loadOwner, "DebtsPage"),
});

const ownerUtangDetailRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/utang/$receiptId",
  component: lazyRouteComponent(loadOwner, "DebtDetailPage"),
});

const ownerKedaluwarsaRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/kedaluwarsa",
  component: lazyRouteComponent(loadOwner, "OwnerExpiryPage"),
});

const ownerOpnameRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/opname",
  component: lazyRouteComponent(loadOwner, "OpnameListPage"),
});

const ownerOpnameDetailRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/opname/$sessionId",
  component: lazyRouteComponent(loadOwner, "OpnameDetailPage"),
});

/** Pohon rute app pemilik (`/owner`). */
export const ownerTree = ownerRoute.addChildren([
  ownerIndexRoute,
  ownerBarangRoute,
  ownerBarangBaruRoute,
  ownerBarangImporRoute,
  ownerBarangDetailRoute,
  ownerBarangUbahRoute,
  ownerLaporanRoute,
  ownerKasbonRoute,
  ownerLainnyaRoute,
  ownerBarangMasukRoute,
  ownerBarangMasukDetailRoute,
  ownerUtangRoute,
  ownerUtangDetailRoute,
  ownerKedaluwarsaRoute,
  ownerOpnameRoute,
  ownerOpnameDetailRoute,
]);
