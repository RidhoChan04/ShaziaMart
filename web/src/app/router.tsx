import {
  createBrowserHistory,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  lazyRouteComponent,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { LoadingScreen } from "@/shared/components/loading-screen";
import { Button } from "@/shared/ui/button";
import { ownerTree } from "./owner-routes";
import { rootRoute } from "./root-route";
import { staffTree } from "./staff-routes";

function RouteError(_props: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">Terjadi kesalahan</h1>
      <Button onClick={() => window.location.reload()}>Muat ulang</Button>
    </main>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/kasir", replace: true });
  },
});

// Satu modul masuk per bagian, sehingga kasir, owner, dan staf masing-masing satu chunk
// (pohon owner dan staf di owner-routes.tsx dan staff-routes.tsx).
const loadKasir = () => import("@/features/kasir");

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

const routeTree = rootRoute.addChildren([
  indexRoute,
  kasirRoute.addChildren([kasirIndexRoute]),
  ownerTree,
  staffTree,
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
