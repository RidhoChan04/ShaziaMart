import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { fitFontSize } from "@/shared/lib/fit-font-size";

/** Lebar isi (tanpa padding) elemen; 0 bila belum bisa diukur (jsdom). */
function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  return (
    el.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  );
}

/**
 * Nominal uang satu baris yang tidak pernah dipotong "…": ukuran huruf turun bertahap
 * mengikuti lebar induk, dan baru membungkus bila sudah di ukuran `min`.
 */
export function FitAmount({
  text,
  max,
  min,
  className,
}: {
  text: string;
  max: number;
  min: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  // Ukur sebelum dilukis agar frame pertama tidak sempat memakai ukuran max.
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    setWidth(Math.floor(contentWidth(parent)));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry?.contentRect.width ?? 0)),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const size = fitFontSize(text, width, { max, min });
  return (
    <span
      ref={ref}
      style={{ fontSize: `${size}px` }}
      className={cn(
        "block",
        size === min ? "[overflow-wrap:anywhere]" : "whitespace-nowrap",
        className,
      )}
    >
      {text}
    </span>
  );
}
