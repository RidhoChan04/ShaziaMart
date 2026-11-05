import { CalendarDays, PackageMinus } from "lucide-react";

/** Satu baris "Baru dikeluarkan": ikon jenis kejadian, kalimat, dan keterangan. */
export function ExpiryLogRow({
  kind,
  text,
  detail,
}: {
  kind: "keluar" | "ubah_ed";
  text: string;
  detail: string;
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
    </li>
  );
}
