import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProviders } from "@/app/providers";
import { createAppQueryClient } from "@/app/query-client";
import { createAppRouter } from "@/app/router";
import { Toaster } from "@/shared/ui/sonner";

/** QueryClient aplikasi (networkMode asli) per test; hanya retry dimatikan agar kegagalan langsung terlihat. */
export function createTestQueryClient() {
  const client = createAppQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  return client;
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
    <QueryClientProvider client={queryClient}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}
