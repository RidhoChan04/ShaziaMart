import { ChevronRight, Clock, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { scopeLabel } from "@/shared/lib/stock-rules";
import type { OpnameDraft } from "./opname-draft-types";

export type OpnameMark =
  | "disarankan"
  | "belum-terkirim"
  | "perlu-dibetulkan"
  | "menunggu";

const MARKS = {
  disarankan: { Icon: Sparkles, cls: "bg-primary-soft text-primary" },
  "belum-terkirim": { Icon: Clock, cls: "bg-warning-soft text-warning-ink" },
  "perlu-dibetulkan": {
    Icon: TriangleAlert,
    cls: "bg-danger-soft text-danger-ink",
  },
  menunggu: { Icon: Clock, cls: "bg-warning-soft text-warning-ink" },
} as const;

/** Satu baris daftar tab Opname: judul, keterangan kecil, tanda status (ikon + teks) dan panah. */
export function OpnameRow({
  title,
  aside,
  note,
  mark,
  markText,
  onOpen,
}: {
  title: string;
  /** Di samping judul (mis. `14 barang`). */
  aside?: string | undefined;
  note: string;
  mark?: OpnameMark | undefined;
  markText?: string | undefined;
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
          {title}
          {aside && (
            <span className="ml-2 text-[13px] font-normal text-muted tabular-nums">
              {aside}
            </span>
          )}
        </span>
        <span className="block text-[13px] text-muted tabular-nums">
          {note}
        </span>
        {m && markText && (
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${m.cls}`}
          >
            <m.Icon aria-hidden="true" className="size-3" />
            {markText}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
    </button>
  );
}

/** Baris draf opname di HP: antre = Belum terkirim, ditolak = Perlu dibetulkan, sedang dihitung = tanpa tanda. */
export function OpnameDraftRow({
  draft,
  onOpen,
}: {
  draft: OpnameDraft;
  onOpen: () => void;
}) {
  const counted = Object.keys(draft.counts).length;
  const mark: OpnameMark | undefined =
    draft.status === "queued"
      ? "belum-terkirim"
      : draft.status === "rejected"
        ? "perlu-dibetulkan"
        : undefined;
  return (
    <OpnameRow
      title={scopeLabel(draft.scope)}
      note={`${counted} dari ${draft.products.length} dihitung`}
      mark={mark}
      markText={
        draft.status === "queued"
          ? "Belum terkirim"
          : draft.status === "rejected"
            ? "Perlu dibetulkan"
            : undefined
      }
      onOpen={onOpen}
    />
  );
}
