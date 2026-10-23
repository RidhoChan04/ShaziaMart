import { useEffect, useState } from "react";

const PULL_THRESHOLD_PX = 64;

/**
 * Tarik ke bawah dari paling atas halaman untuk memuat ulang. Hanya sentuhan satu jari
 * (event touch tidak pernah datang dari mouse). Mengembalikan true selama memuat ulang.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>): boolean {
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let startY: number | null = null;
    let lastY = 0;
    let busy = false;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const canPull = e.touches.length === 1 && window.scrollY === 0;
      startY = canPull && touch ? touch.clientY : null;
      lastY = startY ?? 0;
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (e.touches.length === 1 && touch) lastY = touch.clientY;
      else startY = null;
    };
    const onEnd = () => {
      const pulled = startY !== null && lastY - startY > PULL_THRESHOLD_PX;
      startY = null;
      if (!pulled || busy) return;
      busy = true;
      setRefreshing(true);
      void onRefresh().finally(() => {
        busy = false;
        setRefreshing(false);
      });
    };
    const cancel = () => {
      startY = null;
    };

    const options = { passive: true };
    document.addEventListener("touchstart", onStart, options);
    document.addEventListener("touchmove", onMove, options);
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", cancel);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", cancel);
    };
  }, [onRefresh]);

  return refreshing;
}
