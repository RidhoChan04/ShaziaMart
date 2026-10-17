import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProviders } from "@/app/providers";
import { createAppRouter } from "@/app/router";

/** QueryClient baru per test; tanpa retry agar kegagalan langsung terlihat. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Render aplikasi lengkap (router + query) pada path tertentu memakai memory history. */
export function renderApp(path: string) {
  const queryClient = createTestQueryClient();
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const utils = render(
    <AppProviders router={router} queryClient={queryClient} />,
  );
  return { ...utils, router, queryClient };
}

/** Render komponen yang hanya butuh QueryClient (tanpa router). */
export function renderWithQuery(ui: ReactNode) {
  const queryClient = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
  return { ...utils, queryClient };
}
