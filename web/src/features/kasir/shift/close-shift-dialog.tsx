import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ShiftClosure } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useCloseShift } from "@/shared/api/gen/shift/shift";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { formatAngka, formatRupiah, parseRupiah } from "@/shared/lib/money";
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
import { setSession, setShift, syncGate } from "./gate-state";

type Props = { open: boolean; onClose: () => void };

/** Tutup shift dengan hitung buta: uang seharusnya baru tampil setelah dikirim. */
export function CloseShiftDialog({ open, onClose }: Props) {
  const client = useQueryClient();
  const close = useCloseShift();
  const result = close.data;

  // Server sudah menutup shift & sesi; gerbang baru berpindah setelah hasil dibaca.
  const finish = () => {
    setSession(client, null);
    setShift(client, null);
    syncGate(client);
    close.reset();
    onClose();
  };
  const dismiss = () => {
    if (close.isPending) return;
    if (result) finish();
    else {
      close.reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent
        className="max-w-md"
        showCloseButton={!close.isPending}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusScanBox();
        }}
      >
        <DialogHeader>
          <DialogTitle>Tutup shift</DialogTitle>
          <DialogDescription>
            {result
              ? "Shift sudah ditutup."
              : "Hitung uang di laci, lalu isi jumlahnya."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <ClosureResult result={result} onDone={finish} />
        ) : (
          <CountForm
            pending={close.isPending}
            error={close.isError ? pesanError(close.error) : null}
            onSubmit={(countedCash) => close.mutate({ data: { countedCash } })}
          />
        )}
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

function ClosureResult({
  result,
  onDone,
}: {
  result: ShiftClosure;
  onDone: () => void;
}) {
  const { expectedCash, countedCash, difference } = result;
  return (
    <div className="grid gap-4">
      <dl className="grid gap-2 text-base">
        <ResultRow label="Uang seharusnya" value={formatRupiah(expectedCash)} />
        <ResultRow label="Uang fisik" value={formatRupiah(countedCash)} />
        <ResultRow
          label="Selisih"
          value={
            difference > 0
              ? `+${formatRupiah(difference)}`
              : formatRupiah(difference)
          }
          className={cn("text-lg", difference < 0 && "text-danger")}
        />
      </dl>
      <DialogFooter>
        <Button size="lg" onClick={onDone}>
          Selesai
        </Button>
      </DialogFooter>
    </div>
  );
}

function ResultRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-bold tabular-nums", className)}>{value}</dd>
    </div>
  );
}
