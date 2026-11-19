import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";
import { SCAN_GAP_MS, useScanGuard } from "@/shared/hooks/use-scan-guard";
import { REASON_MAX } from "@/shared/lib/reason-rules";

/**
 * Isian Alasan kasir yang kebal rentetan scanner (dipakai ReasonDialog dan dialog Kas keluar):
 * rentetan di isian tidak menjadi alasan (`scanned` → ScannedAlert), dan Enter penutup rentetan
 * di elemen mana pun dalam form (radio, tombol) tidak mengirim form (`formProps`).
 */
export function useReasonField() {
  const [reason, setReason] = useState("");
  const guard = useScanGuard(setReason);
  const lastDigitAt = useRef(Number.NEGATIVE_INFINITY);

  return {
    trimmed: reason.trim(),
    scanned: guard.scanned,
    formProps: {
      onKeyDownCapture: (e: KeyboardEvent<HTMLFormElement>) => {
        const now = performance.now();
        if (/^\d$/.test(e.key)) {
          lastDigitAt.current = now;
        } else if (
          e.key === "Enter" &&
          now - lastDigitAt.current < SCAN_GAP_MS
        ) {
          e.preventDefault();
        }
      },
    },
    inputProps: {
      autoComplete: "off",
      maxLength: REASON_MAX,
      value: reason,
      onKeyDown: guard.onKeyDown,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setReason(e.target.value);
        guard.reset();
      },
    },
  };
}
