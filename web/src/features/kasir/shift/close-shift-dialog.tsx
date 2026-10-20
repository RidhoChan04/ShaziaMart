import { useState } from "react";
import type { ShiftClosure } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useCloseShift } from "@/shared/api/gen/shift/shift";
import { pesanError } from "@/shared/lib/error-messages";
import { formatAngka, parseRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { MoneyField } from "../payment/tunai-tab";
import { focusScanBox } from "../scan/scan-box";
import { DenominationCalculator } from "./denomination-calculator";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Shift tertutup; hasilnya ditampilkan di luar gerbang (ShiftClosureDialog). */
  onClosed: (closure: ShiftClosure) => void;
};

/** Tutup shift dengan hitung buta: uang seharusnya tidak pernah tampil di sini. */
export function CloseShiftDialog({ open, onClose, onClosed }: Props) {
  const close = useCloseShift({ mutation: { onSuccess: onClosed } });
  const dismiss = () => {
    if (close.isPending) return;
    close.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent
        className="max-w-md"
        showCloseButton={!close.isPending}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          // Setelah berhasil, fokus milik jendela hasil.
          if (!close.isSuccess) focusScanBox();
        }}
      >
        <DialogHeader>
          <DialogTitle>Tutup shift</DialogTitle>
          <DialogDescription>
            Hitung uang di laci, lalu isi jumlahnya.
          </DialogDescription>
        </DialogHeader>
        <CountForm
          pending={close.isPending}
          error={close.isError ? pesanError(close.error) : null}
          onSubmit={(countedCash) => close.mutate({ data: { countedCash } })}
        />
      </DialogContent>
    </Dialog>
  );
}

function CountForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (countedCash: number) => void;
}) {
  const [text, setText] = useState("");
  const [calculator, setCalculator] = useState(false);
  const counted = parseRupiah(text);

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (counted !== null && !pending) onSubmit(counted);
      }}
    >
      <MoneyField label="Uang fisik di laci" value={text} onChange={setText} />
      <Button
        type="button"
        variant="outline"
        aria-expanded={calculator}
        onClick={() => setCalculator((v) => !v)}
      >
        Hitung per pecahan
      </Button>
      {calculator && (
        <DenominationCalculator onTotal={(n) => setText(formatAngka(n))} />
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          type="submit"
          size="lg"
          disabled={counted === null || pending}
          aria-busy={pending}
        >
          Tutup shift
        </Button>
      </DialogFooter>
    </form>
  );
}
