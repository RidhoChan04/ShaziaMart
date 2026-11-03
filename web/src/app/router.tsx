import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  Link,
  lazyRouteComponent,
  Outlet,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadingScreen } from "@/shared/components/loading-screen";
import { Button } from "@/shared/ui/button";

const mockEnabled = import.meta.env.DEV || import.meta.env.VITE_MOCK === "1";

// Di build produksi tanpa mock, cabang ini dibuang sehingga kode mock tidak ikut.
const DevPanel = mockEnabled
  ? lazy(() =>
      import("@/mocks/dev-panel").then((m) => ({ default: m.DevPanel })),
    )
  : null;

function RootLayout() {
  return (
    <>
      <Outlet />
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </>
  );
}

const linkClass =
  "inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 font-medium hover:bg-primary-soft";

function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">Halaman tidak ditemukan</h1>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/kasir" className={linkClass}>
          Buka layar kasir
        </Link>
        <Link to="/owner" className={linkClass}>
          Buka aplikasi pemilik
        </Link>
      </div>
    </main>
  );
}

function RouteError(_props: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">Terjadi kesalahan</h1>
      <Button onClick={() => window.location.reload()}>Muat ulang</Button>
    </main>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/kasir", replace: true });
  },
});

// Satu modul masuk per bagian, sehingga kasir, owner, dan staf masing-masing satu chunk.
const loadKasir = () => import("@/features/kasir");
const loadOwner = () => import("@/features/owner");
const loadStaff = () => import("@/features/staff");

const kasirRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "kasir",
  component: lazyRouteComponent(loadKasir, "KasirLayout"),
});

const kasirIndexRoute = createRoute({
  getParentRoute: () => kasirRoute,
  path: "/",
  component: lazyRouteComponent(loadKasir, "KasirPage"),
});

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

// App HP orang toko (realm `/api/staff`); halaman Masuk menyusul (Task 10/11).
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
  component: lazyRouteComponent(loadStaff, "StaffPlaceholderPage"),
});

const staffKedaluwarsaRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "kedaluwarsa",
  component: lazyRouteComponent(loadStaff, "StaffPlaceholderPage"),
});

const staffLainnyaRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: "lainnya",
  component: lazyRouteComponent(loadStaff, "StaffLainnyaPage"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  kasirRoute.addChildren([kasirIndexRoute]),
  ownerRoute.addChildren([
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
  ]),
  staffRoute.addChildren([
    staffIndexRoute,
    staffMasukRoute,
    staffMasukBaruRoute,
    staffMasukDetailRoute,
    staffOpnameRoute,
    staffKedaluwarsaRoute,
    staffLainnyaRoute,
  ]),
]);

/** `history` bisa disuntik (memory history di test); default browser history. */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    history: options.history ?? createBrowserHistory(),
    defaultErrorComponent: RouteError,
    defaultPendingComponent: LoadingScreen,
    // Chunk yang cepat dimuat tidak sempat memunculkan "Memuat…".
    defaultPendingMs: 200,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
