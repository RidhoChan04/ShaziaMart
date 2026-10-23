import {
  type QueryClient,
  type QueryKey,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError } from "@/shared/api/fetcher";
import {
  getGetOwnerSessionQueryKey,
  getOwnerSession,
} from "@/shared/api/gen/owner/owner";
import type { OwnerSession } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { HEALTH_POLL_MS } from "@/shared/hooks/use-server-health";

const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "UNAUTHORIZED";

// Query pemilik berkunci URL `/api/owner/…`; mutasinya berkunci operationId `owner…`.
const isOwnerKey = (key: QueryKey | undefined): boolean => {
  const head = key?.[0];
  return (
    typeof head === "string" &&
    (head.startsWith("/api/owner/") || head.startsWith("owner"))
  );
};

/**
 * `null` = belum login (401 bukan galat). Sesi hanya berubah lewat login/keluar
 * (yang memperbarui cache), jadi tidak dimuat ulang otomatis; bila belum pernah
 * berhasil karena server mati, dicoba lagi seirama cek kesehatan server.
 */
export function useOwnerSession() {
  return useQuery<OwnerSession | null, ApiError>({
    queryKey: getGetOwnerSessionQueryKey(),
    queryFn: ({ signal }) =>
      getOwnerSession({ signal }).catch((error: unknown) => {
        if (isUnauthorized(error)) return null;
        throw error;
      }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchInterval: (query) =>
      query.state.data === undefined && query.state.status === "error"
        ? HEALTH_POLL_MS
        : false,
  });
}

/** Masuk: pakai sesi dari server lalu cocokkan ulang. */
export function setOwnerSession(client: QueryClient, session: OwnerSession) {
  client.setQueryData(getGetOwnerSessionQueryKey(), session);
  void client.invalidateQueries({ queryKey: getGetOwnerSessionQueryKey() });
}

/** Keluar: sesi kosong dan data pemilik lain dibuang agar tidak terlihat sesudah login berikutnya. */
export function clearOwnerSession(client: QueryClient) {
  const sessionKey = getGetOwnerSessionQueryKey();
  client.removeQueries({
    predicate: (q) => isOwnerKey(q.queryKey) && q.queryKey[0] !== sessionKey[0],
  });
  client.setQueryData<OwnerSession | null>(sessionKey, null);
}

/** 401 `UNAUTHORIZED` dari query/mutasi pemilik mana pun → kembali ke login; 401 kasir diabaikan. */
export function useLogoutOnUnauthorized() {
  const client = useQueryClient();
  useEffect(() => {
    const drop = (key: QueryKey | undefined, error: unknown) => {
      if (isOwnerKey(key) && isUnauthorized(error)) clearOwnerSession(client);
    };
    const offQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        drop(event.query.queryKey, event.action.error);
      }
    });
    const offMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        drop(event.mutation.options.mutationKey, event.action.error);
      }
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [client]);
}
