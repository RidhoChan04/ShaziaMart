import { Clock, EllipsisVertical, OctagonAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type ExpiryTone = "bad" | "warn";

/** Satu kiriman ber-ED: nama, `±jumlah · ED tanggal`, teks waktu (ikon + teks), dan tombol ⋯. */
export function ExpiryRow({
  name,
  qtyText,
  expiryText,
  whenText,
  tone,
  trailing,
  onMore,
}: {
  name: string;
  /** `3 bungkus` (diberi awalan `±`). */
  qtyText: string;
  /** `31 Okt 2026` (diberi awalan `ED`). */
  expiryText: string;
  /** `Lewat 2 hari` · `Hari ini` · `13 hari lagi`. */
  whenText: string;
  tone: ExpiryTone;
  /** Teks kanan opsional (pemilik: nilai rupiah). */
  trailing?: string | undefined;
  onMore: (button: HTMLButtonElement) => void;
}) {
  const Icon = tone === "bad" ? OctagonAlert : Clock;
  return (
    <li className="flex min-h-16 items-center gap-2 py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-[14px] text-muted tabular-nums">
          {`±${qtyText} · `}
          <b className="font-semibold text-text">{`ED ${expiryText}`}</b>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-[13px] font-semibold",
            tone === "bad" ? "text-danger-ink" : "text-warning-ink",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          {whenText}
        </div>
      </div>
      {trailing && (
        <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums">
          {trailing}
        </span>
      )}
      <button
        type="button"
        aria-label="Pilihan"
        onClick={(e) => onMore(e.currentTarget)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-bg text-text outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <EllipsisVertical aria-hidden="true" className="size-5" />
      </button>
    </li>
  );
}
