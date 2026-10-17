import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/fetcher";

/**
 * Server ada di localhost: status offline browser tidak berarti server tak terjangkau,
 * jadi fetch/mutasi tidak boleh dijeda (`networkMode: "always"`). Retry hanya sekali
 * untuk kegagalan jaringan atau 5xx agar UI galat tidak tertunda.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: (failureCount, error) =>
          error instanceof ApiError &&
          (error.code === "NETWORK" || error.status >= 500) &&
          failureCount < 1,
      },
      mutations: { networkMode: "always", retry: false },
    },
  });
}
