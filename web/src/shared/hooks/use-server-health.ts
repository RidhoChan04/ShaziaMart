import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  getGetHealthQueryKey,
  useGetHealth,
} from "@/shared/api/gen/system/system";

export const HEALTH_POLL_MS = 5000;

export type ServerHealth = {
  /** Sukses dengan `status === "ok"`. Error apa pun (503, jaringan) = offline. */
  online: boolean;
  /** Belum ada hasil pemeriksaan pertama; status server belum diketahui. */
  checking: boolean;
};

export function useServerHealth(): ServerHealth {
  const query = useGetHealth({
    query: { refetchInterval: HEALTH_POLL_MS, retry: false },
  });
  const online = query.isSuccess && query.data.status === "ok";
  return { online, checking: query.isPending };
}

/** Periksa ulang server sekarang (tombol "Coba lagi"). */
export function useRecheckServer(): {
  recheck: () => void;
  rechecking: boolean;
} {
  const queryClient = useQueryClient();
  const queryKey = getGetHealthQueryKey();
  const rechecking = useIsFetching({ queryKey }) > 0;
  return {
    recheck: () => {
      void queryClient.refetchQueries({ queryKey });
    },
    rechecking,
  };
}
