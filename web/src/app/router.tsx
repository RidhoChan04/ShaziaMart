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

// Satu modul masuk per bagian, sehingga kasir dan owner masing-masing satu chunk.
const loadKasir = () => import("@/features/kasir");
const loadOwner = () => import("@/features/owner");

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
  component: lazyRouteComponent(loadOwner, "BarangPage"),
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  kasirRoute.addChildren([kasirIndexRoute]),
  ownerRoute.addChildren([
    ownerIndexRoute,
    ownerBarangRoute,
    ownerLaporanRoute,
    ownerKasbonRoute,
    ownerLainnyaRoute,
  ]),
]);

/** `history` bisa disuntik (memory history di test); default browser history. */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    history: options.history ?? createBrowserHistory(),
    defaultErrorComponent: RouteError,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
