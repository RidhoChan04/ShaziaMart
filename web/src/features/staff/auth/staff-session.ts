import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError } from "@/shared/api/fetcher";
import type { Session } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetStaffSessionQueryKey,
  getStaffSession,
} from "@/shared/api/gen/staff/staff";
import { HEALTH_POLL_MS } from "@/shared/hooks/use-server-health";

const STAFF_PATH = "/api/staff/";

const isUnauthorized = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === "UNAUTHORIZED";

// Realm ditentukan oleh URL request yang gagal, bukan nama operasi/kunci cache.
const isStaffUnauthorized = (error: unknown): boolean =>
  isUnauthorized(error) && error.url.startsWith(STAFF_PATH);

/**
 * `null` = belum login (401 bukan galat). Sesi hanya berubah lewat login/keluar
 * (yang memperbarui cache), jadi tidak dimuat ulang otomatis; bila belum pernah
 * berhasil (server mati, ditolak di luar Wi-Fi toko), dicoba lagi seirama cek kesehatan server.
 */
export function useStaffSession() {
  return useQuery<Session | null, ApiError>({
    queryKey: getGetStaffSessionQueryKey(),
    queryFn: ({ signal }) =>
      getStaffSession({ signal }).catch((error: unknown) => {
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
export function setStaffSession(client: QueryClient, session: Session) {
  client.setQueryData(getGetStaffSessionQueryKey(), session);
  void client.invalidateQueries({ queryKey: getGetStaffSessionQueryKey() });
}

/**
 * Keluar: sesi kosong dan data orang toko lain dibuang agar tidak terlihat oleh
 * orang yang masuk berikutnya. Draf di HP tidak disentuh; sesi kasir & pemilik juga tidak.
 */
export function clearStaffSession(client: QueryClient) {
  const [sessionPath] = getGetStaffSessionQueryKey();
  // Kunci query hasil orval adalah URL-nya.
  client.removeQueries({
    predicate: ({ queryKey: [head] }) =>
      typeof head === "string" &&
      head.startsWith(STAFF_PATH) &&
      head !== sessionPath,
  });
  client.setQueryData<Session | null>(getGetStaffSessionQueryKey(), null);
}

/** 401 `UNAUTHORIZED` dari query/mutasi `/api/staff/*` → kembali ke login; 401 realm lain diabaikan. */
export function useStaffLogoutOnUnauthorized() {
  const client = useQueryClient();
  useEffect(() => {
    const drop = (error: unknown) => {
      if (isStaffUnauthorized(error)) clearStaffSession(client);
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
