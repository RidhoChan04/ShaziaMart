import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

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

/** Akar semua rute; tiap app (kasir, owner, staf) menggantungkan pohonnya di sini. */
export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});
