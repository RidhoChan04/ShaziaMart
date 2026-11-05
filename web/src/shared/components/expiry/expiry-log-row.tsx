import { CalendarDays, PackageMinus } from "lucide-react";

/** Satu baris "Baru dikeluarkan": ikon jenis kejadian, kalimat, dan keterangan. */
export function ExpiryLogRow({
  kind,
  text,
  detail,
  trailing,
}: {
  kind: "keluar" | "ubah_ed";
  text: string;
  detail: string;
  /** Teks kanan opsional (pemilik: nilai rupiah). */
  trailing?: string | undefined;
}) {
  const Icon = kind === "keluar" ? PackageMinus : CalendarDays;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden="true"
        className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-muted/70 text-white"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        <div>{text}</div>
        <small className="block text-[13px] text-muted">{detail}</small>
      </div>
      {trailing && (
        <span className="shrink-0 text-[14px] font-semibold tabular-nums">
          {trailing}
        </span>
      )}
    </li>
  );
}
