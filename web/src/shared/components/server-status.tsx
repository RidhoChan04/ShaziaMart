import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  getGetHealthQueryKey,
  useGetHealth,
} from "@/shared/api/gen/system/system";
import { cn } from "@/shared/lib/cn";

export const HEALTH_POLL_MS = 5000;

export type ServerHealth = {
  /** Respons 200 dengan `status === "ok"`. Error apa pun (503, jaringan) = offline. */
  online: boolean;
  /** Belum ada hasil pemeriksaan pertama; status server belum diketahui. */
  checking: boolean;
};

export function useServerHealth(): ServerHealth {
  const query = useGetHealth({
    query: { refetchInterval: HEALTH_POLL_MS, retry: false },
  });
  const online =
    query.isSuccess &&
    query.data.status === 200 &&
    query.data.data.status === "ok";
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

export function ServerStatus({ className }: { className?: string }) {
  const { online, checking } = useServerHealth();
  const label = checking
    ? "● Memeriksa server…"
    : online
      ? "● Server tersambung"
      : "● Server tidak tersambung";
  return (
    <span
      className={cn(
        checking ? "text-muted" : online ? "text-primary" : "text-danger",
        className,
      )}
    >
      {label}
    </span>
  );
}
