import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatIsoDate, isIsoDate } from "@/shared/lib/business-day";
import { Button } from "@/shared/ui/button";
import { SheetFrame, type SheetFrameProps, SheetNotes } from "./sheet-frame";

/** Lembar ubah tanggal ED satu kiriman; isian tanggal bawaan HP transparan di atas teks tanggal. */
export function ExpiryDateSheet({
  name,
  currentDate,
  offline,
  pending,
  error,
  onSave,
  open,
  onClose,
  returnFocus,
}: SheetFrameProps & {
  name: string;
  /** ISO `YYYY-MM-DD`. */
  currentDate: string;
  offline: boolean;
  pending: boolean;
  error: string | null;
  onSave: (expiryDate: string) => void;
}) {
  const [date, setDate] = useState(currentDate);
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      returnFocus={returnFocus}
      title="Ubah tanggal ED"
      description={name}
    >
      <div className="relative flex min-h-12 items-center justify-between gap-3 rounded-lg bg-bg px-4">
        <span className="text-[17px]">Tanggal kedaluwarsa</span>
        <span className="flex min-w-0 items-center gap-1 text-[17px] font-medium text-primary tabular-nums">
          {isIsoDate(date) ? formatIsoDate(date) : "Pilih tanggal"}
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted"
          />
        </span>
        <input
          type="date"
          aria-label="Tanggal kedaluwarsa"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
        />
      </div>
      <SheetNotes error={error} offline={offline} />
      <Button
        size="lg"
        disabled={pending || offline}
        onClick={() => onSave(date)}
      >
        Simpan tanggal
      </Button>
    </SheetFrame>
  );
}
