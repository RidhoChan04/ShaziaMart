import {
  type QueryClient,
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

const OWNER_PATH = "/api/owner/";

const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "UNAUTHORIZED";

// Realm ditentukan oleh URL request yang gagal, bukan nama operasi/kunci cache.
const isOwnerUnauthorized = (error: unknown): boolean =>
  isUnauthorized(error) && (error as ApiError).url.startsWith(OWNER_PATH);

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
  const [sessionPath] = getGetOwnerSessionQueryKey();
  // Kunci query hasil orval adalah URL-nya.
  client.removeQueries({
    predicate: ({ queryKey: [head] }) =>
      typeof head === "string" &&
      head.startsWith(OWNER_PATH) &&
      head !== sessionPath,
  });
  client.setQueryData<OwnerSession | null>(getGetOwnerSessionQueryKey(), null);
}

/** 401 `UNAUTHORIZED` dari query/mutasi pemilik mana pun → kembali ke login; 401 kasir diabaikan. */
export function useLogoutOnUnauthorized() {
  const client = useQueryClient();
  useEffect(() => {
    const drop = (error: unknown) => {
      if (isOwnerUnauthorized(error)) clearOwnerSession(client);
    };
    const offQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        drop(event.action.error);
      }
    });
    const offMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        drop(event.action.error);
      }
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [client]);
}
