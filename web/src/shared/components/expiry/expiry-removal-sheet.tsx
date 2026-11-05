import { useState } from "react";
import { removedText } from "@/shared/lib/stock-rules";
import { Button } from "@/shared/ui/button";
import { UnitCounter } from "../unit-counter";
import { SheetFrame, type SheetFrameProps, SheetNotes } from "./sheet-frame";

const MIN_QTY = "Jumlah minimal 1";

/** Lembar keluarkan dari stok: penghitung `Jumlah` (default perkiraan) dan catatan alasan. */
export function ExpiryRemovalSheet({
  name,
  estimateQtyBase,
  unitName,
  unitSize,
  isCurah,
  actorName,
  offline,
  pending,
  error,
  onSubmit,
  open,
  onClose,
  returnFocus,
}: SheetFrameProps & {
  name: string;
  /** Perkiraan sisa kiriman ini (satuan dasar); jumlah awal penghitung. */
  estimateQtyBase: number;
  /** Satuan eceran dan isinya (curah: `kg` isi 1000). */
  unitName: string;
  unitSize: number;
  isCurah: boolean;
  actorName: string;
  offline: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (qtyBase: number) => void;
}) {
  const [qty, setQty] = useState(estimateQtyBase);
  const [invalid, setInvalid] = useState(false);
  const liquid = /^(l|liter|ml)$/i.test(unitName);
  const label = qty >= 1 ? removedText(qty, unitSize, unitName, isCurah) : "";
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      returnFocus={returnFocus}
      title="Keluarkan dari stok"
      description={name}
    >
      <div className="grid gap-1">
        <span className="px-1 text-[13px] font-semibold text-muted">
          Jumlah
        </span>
        <UnitCounter
          units={[
            { id: "eceran", name: unitName, unitSize: isCurah ? unitSize : 1 },
          ]}
          baseUnitName={isCurah ? (liquid ? "ml" : "gram") : unitName}
          isCurah={isCurah}
          value={qty}
          hideTotal
          onChange={(v) => {
            setQty(v);
            setInvalid(false);
          }}
        />
      </div>
      <p className="text-[14px] text-muted">
        {`Alasan: kedaluwarsa · tercatat atas nama ${actorName}`}
      </p>
      <SheetNotes error={invalid ? MIN_QTY : error} offline={offline} />
      <Button
        size="lg"
        variant="danger"
        disabled={pending || offline}
        onClick={() => {
          if (qty < 1) {
            setInvalid(true);
            return;
          }
          onSubmit(qty);
        }}
      >
        {label ? `Keluarkan ${label}` : "Keluarkan"}
      </Button>
    </SheetFrame>
  );
}
