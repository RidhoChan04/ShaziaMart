import { type RefObject, useEffect, useState } from "react";

/** True selama elemen sudah tergulir lewat tepi atas viewport; false bila IntersectionObserver tidak ada. */
export function useScrolledPast(ref: RefObject<Element | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      // Keluar lewat bawah (belum digulir sampai) bukan "lewat".
      if (entry)
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return past;
}
