import { Ban, Clock, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatIsoDate } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import type { ReceiptDraft } from "../drafts/draft-types";
import { formTotal } from "./form-model";

export type RowMark = "belum-terkirim" | "perlu-dibetulkan" | "dibatalkan";

const MARKS = {
  "belum-terkirim": {
    label: "Belum terkirim",
    Icon: Clock,
    cls: "bg-warning-soft text-warning-ink",
  },
  "perlu-dibetulkan": {
    label: "Perlu dibetulkan",
    Icon: TriangleAlert,
    cls: "bg-danger-soft text-danger-ink",
  },
  dibatalkan: { label: "Dibatalkan", Icon: Ban, cls: "bg-bg text-muted" },
} as const;

/** Satu baris daftar nota/draf: supplier, "tanggal · n barang", total, dan tanda status (ikon + teks). */
export function ReceiptRow({
  supplierName,
  notaDate,
  lineCount,
  total,
  mark,
  onOpen,
}: {
  supplierName: string;
  notaDate: string;
  lineCount: number;
  total: number | null;
  mark?: RowMark | undefined;
  onOpen: () => void;
}): ReactNode {
  const m = mark ? MARKS[mark] : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full min-w-0 items-center justify-between gap-3 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {supplierName.trim() || "Tanpa supplier"}
        </span>
        <span className="block text-[13px] text-muted tabular-nums">
          {`${formatIsoDate(notaDate)} · ${lineCount} barang`}
        </span>
        {m && (
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${m.cls}`}
          >
            <m.Icon aria-hidden="true" className="size-3" />
            {m.label}
          </span>
        )}
      </span>
      <span className="shrink-0 font-medium tabular-nums">
        {total === null ? "—" : formatRupiah(total)}
      </span>
    </button>
  );
}

/** Baris draf di HP: antre = Belum terkirim, ditolak = Perlu dibetulkan, sedang diisi = tanpa tanda. */
export function DraftRow({
  draft,
  onOpen,
}: {
  draft: ReceiptDraft;
  onOpen: () => void;
}) {
  const mark: RowMark | undefined =
    draft.status === "queued"
      ? "belum-terkirim"
      : draft.status === "rejected"
        ? "perlu-dibetulkan"
        : undefined;
  return (
    <ReceiptRow
      supplierName={draft.form.supplierName}
      notaDate={draft.form.notaDate}
      lineCount={draft.form.lines.length}
      total={formTotal(draft.form)}
      mark={mark}
      onOpen={onOpen}
    />
  );
}
