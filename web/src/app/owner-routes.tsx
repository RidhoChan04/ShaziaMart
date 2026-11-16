import {
  createRoute,
  lazyRouteComponent,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import {
  type ReportSearch,
  validateReportSearch,
} from "@/features/owner/laporan/report-search";
import { jakartaIsoDate } from "@/shared/lib/business-day";
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

/** Periode laporan di URL (K26); tanpa/tidak sah → bulan berjalan. Dipakai semua rute Laporan. */
const validateLaporan = (
  search: Partial<ReportSearch> & SearchSchemaInput,
): ReportSearch => validateReportSearch(search, jakartaIsoDate(Date.now()));

const ownerLaporanRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "LaporanPage"),
});

// Sub-halaman Laporan membawa search periode yang sama (isi: T12/T13).
const ownerPalingLakuRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/paling-laku",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "TopProductsPage"),
});

const ownerKategoriRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/kategori",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "CategoriesPage"),
});

const ownerLaporanKasirRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/kasir",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "ReportKasirPage"),
});

const ownerTidakTerjualRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/tidak-terjual",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "UnsoldPage"),
});

const ownerUntungTipisRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/untung-tipis",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "ThinMarginPage"),
});

const ownerSelisihOpnameRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/selisih-opname",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "OpnameReportPage"),
});

const ownerSelisihOpnameBarangRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "laporan/selisih-opname/$productId",
  validateSearch: validateLaporan,
  component: lazyRouteComponent(loadOwner, "OpnameProductPage"),
});

const ownerKasbonRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "kasbon",
  component: lazyRouteComponent(loadOwner, "KasbonPage"),
});

const ownerKasbonDetailRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "kasbon/$customerId",
  component: lazyRouteComponent(loadOwner, "CustomerPage"),
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

const ownerPengecualianRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "pengecualian/$kind",
  component: lazyRouteComponent(loadOwner, "ExceptionsPage"),
});

const ownerTransaksiRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/transaksi",
  validateSearch: (
    search: Record<string, unknown>,
  ): { tanggal?: string; q?: string } => ({
    ...(typeof search.tanggal === "string" && search.tanggal
      ? { tanggal: search.tanggal }
      : {}),
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
  }),
  component: lazyRouteComponent(loadOwner, "SalesPage"),
});

const ownerTransaksiDetailRoute = createRoute({
  getParentRoute: () => ownerRoute,
  path: "lainnya/transaksi/$saleId",
  component: lazyRouteComponent(loadOwner, "SaleDetailPage"),
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
  ownerPalingLakuRoute,
  ownerKategoriRoute,
  ownerLaporanKasirRoute,
  ownerTidakTerjualRoute,
  ownerUntungTipisRoute,
  ownerSelisihOpnameRoute,
  ownerSelisihOpnameBarangRoute,
  ownerKasbonRoute,
  ownerKasbonDetailRoute,
  ownerLainnyaRoute,
  ownerBarangMasukRoute,
  ownerBarangMasukDetailRoute,
  ownerUtangRoute,
  ownerUtangDetailRoute,
  ownerKedaluwarsaRoute,
  ownerOpnameRoute,
  ownerOpnameDetailRoute,
  ownerPengecualianRoute,
  ownerTransaksiRoute,
  ownerTransaksiDetailRoute,
]);
