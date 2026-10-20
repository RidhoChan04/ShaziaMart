import { useQueryClient } from "@tanstack/react-query";
import type { ShiftClosure } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { setSession, setShift, syncGate } from "./gate-state";

/**
 * Hasil tutup shift. Dirender di luar gerbang: server sudah menghapus sesi & shift,
 * jadi gerbang boleh berpindah di belakangnya; hasil bertahan sampai `Selesai`.
 */
export function ShiftClosureDialog({
  closure,
  onDone,
}: {
  closure: ShiftClosure | null;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const finish = () => {
    setSession(client, null);
    setShift(client, null);
    syncGate(client);
    onDone();
  };
  return (
    <Dialog open={closure !== null} onOpenChange={(next) => !next && finish()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tutup shift</DialogTitle>
          <DialogDescription>Shift sudah ditutup.</DialogDescription>
        </DialogHeader>
        {closure && <ClosureResult result={closure} onDone={finish} />}
      </DialogContent>
    </Dialog>
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
