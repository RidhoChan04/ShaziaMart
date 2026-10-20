import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError } from "@/shared/api/fetcher";
import { getGetSessionQueryKey, getSession } from "@/shared/api/gen/auth/auth";
import type {
  CurrentShift,
  Session,
  Shift,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetCurrentShiftQueryKey,
  useGetCurrentShift,
} from "@/shared/api/gen/shift/shift";
import { HEALTH_POLL_MS } from "@/shared/hooks/use-server-health";

export type GateState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "no-shift" }
  | { status: "locked"; shift: Shift }
  | { status: "open"; shift: Shift; session: Session };

const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "UNAUTHORIZED";

// Belum pernah berhasil karena server mati: coba lagi seirama cek kesehatan server.
const pollWhileUnknown = (query: {
  state: { data: unknown; status: string };
}) =>
  query.state.data === undefined && query.state.status === "error"
    ? HEALTH_POLL_MS
    : false;

/**
 * Sesi & shift hanya berubah lewat aksi di layar ini (yang memperbarui cache),
 * jadi tidak dimuat ulang otomatis; data terakhir tetap dipakai walau refetch gagal.
 */
const STABLE = { staleTime: Number.POSITIVE_INFINITY, retry: false } as const;

function useSessionQuery() {
  return useQuery<Session | null, ApiError>({
    queryKey: getGetSessionQueryKey(),
    // 401 berarti "belum login", bukan galat.
    queryFn: ({ signal }) =>
      getSession({ signal }).catch((error: unknown) => {
        if (isUnauthorized(error)) return null;
        throw error;
      }),
    ...STABLE,
    refetchInterval: pollWhileUnknown,
  });
}

export function useGateState(): GateState {
  const session = useSessionQuery();
  const current = useGetCurrentShift({
    query: { ...STABLE, refetchInterval: pollWhileUnknown },
  });
  if (session.data === undefined || current.data === undefined) {
    return session.isError || current.isError
      ? { status: "offline" }
      : { status: "loading" };
  }
  const { shift } = current.data;
  if (!shift) return { status: "no-shift" };
  // Hanya kasir pemilik shift yang membuka layar.
  if (!session.data || session.data.user.id !== shift.kasirId) {
    return { status: "locked", shift };
  }
  return { status: "open", shift, session: session.data };
}

export function setSession(client: QueryClient, session: Session | null) {
  client.setQueryData(getGetSessionQueryKey(), session);
}

export function setShift(client: QueryClient, shift: Shift | null) {
  const body: CurrentShift = { shift };
  client.setQueryData(getGetCurrentShiftQueryKey(), body);
}

/** Cocokkan cache dengan server setelah login/buka/tutup shift/kunci. */
export function syncGate(client: QueryClient) {
  void client.invalidateQueries({ queryKey: getGetSessionQueryKey() });
  void client.invalidateQueries({ queryKey: getGetCurrentShiftQueryKey() });
}

/** 401 `UNAUTHORIZED` dari query/mutasi mana pun → sesi dianggap habis (layar kunci). */
export function useLockOnUnauthorized() {
  const client = useQueryClient();
  useEffect(() => {
    const drop = (error: unknown) => {
      if (isUnauthorized(error)) setSession(client, null);
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
