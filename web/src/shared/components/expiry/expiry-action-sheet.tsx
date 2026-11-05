import { CalendarDays, PackageMinus } from "lucide-react";
import { OFFLINE_TEXT, SheetFrame, type SheetFrameProps } from "./sheet-frame";

const option =
  "flex min-h-14 w-full items-center gap-3 rounded-lg bg-bg px-4 py-2 text-left text-[17px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

/** Lembar pilihan satu baris kedaluwarsa: ubah tanggal ED atau keluarkan dari stok. */
export function ExpiryActionSheet({
  name,
  summary,
  actorName,
  offline,
  onChangeDate,
  onRemove,
  open,
  onClose,
  returnFocus,
}: SheetFrameProps & {
  name: string;
  /** `±6 kaleng · ED 15 Nov 2026 · CV Sumber Rejeki, 3 Agu`. */
  summary: string;
  actorName: string;
  offline: boolean;
  onChangeDate: () => void;
  onRemove: () => void;
}) {
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      returnFocus={returnFocus}
      title={name}
      description={summary}
    >
      <button
        type="button"
        className={option}
        disabled={offline}
        onClick={onChangeDate}
      >
        <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
        Ubah tanggal ED
      </button>
      <button
        type="button"
        className={option}
        disabled={offline}
        onClick={onRemove}
      >
        <PackageMinus
          aria-hidden="true"
          className="size-5 shrink-0 text-danger"
        />
        <span className="grid min-w-0">
          <span className="text-danger">Keluarkan dari stok</span>
          <small className="text-[13px] font-normal text-muted">
            {`Alasan: kedaluwarsa · tercatat atas nama ${actorName}`}
          </small>
        </span>
      </button>
      {offline && <p className="text-[14px] text-muted">{OFFLINE_TEXT}</p>}
      <button
        type="button"
        onClick={onClose}
        className="min-h-12 w-full rounded-lg bg-surface text-[17px] font-semibold text-primary outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-primary"
      >
        Batal
      </button>
    </SheetFrame>
  );
}
