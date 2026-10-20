import { useEffect, useRef } from "react";

const MAX_GAP_MS = 30;
const MIN_LENGTH = 4;

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Mendeteksi scanner USB (mengetik cepat lalu Enter) saat fokus tidak di kolom isian.
 * Diabaikan bila ada dialog terbuka agar scan tidak bocor ke layar di belakangnya.
 */
export function useScanDetector(onScan: (code: string) => void): void {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const feed = createScanBuffer((code) => handler.current(code));
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (
        isEditable(document.activeElement) ||
        document.querySelector('[role="dialog"]')
      ) {
        feed.reset();
        return;
      }
      if (feed.key(event.key, performance.now())) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function createScanBuffer(onScan: (code: string) => void) {
  let buffer = "";
  let last = 0;
  return {
    reset() {
      buffer = "";
    },
    /** Mengembalikan true bila tombol ini menuntaskan sebuah scan. */
    key(key: string, now: number): boolean {
      if (key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length < MIN_LENGTH || now - last >= MAX_GAP_MS) return false;
        onScan(code);
        return true;
      }
      if (key.length !== 1) return false;
      if (now - last >= MAX_GAP_MS) buffer = "";
      buffer += key;
      last = now;
      return false;
    },
  };
}
