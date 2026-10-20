import { useEffect, useEffectEvent } from "react";

const IDLE_LOCK_MS = 300_000;
const ACTIVITY = ["pointerdown", "keydown"] as const;

/** Panggil `onLock` setelah `ms` tanpa sentuhan/ketikan di jendela. */
export function useIdleLock(onLock: () => void, ms = IDLE_LOCK_MS) {
  const lock = useEffectEvent(onLock);
  useEffect(() => {
    let timer = setTimeout(lock, ms);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, ms);
    };
    for (const type of ACTIVITY) window.addEventListener(type, reset);
    return () => {
      clearTimeout(timer);
      for (const type of ACTIVITY) window.removeEventListener(type, reset);
    };
  }, [ms]);
}
