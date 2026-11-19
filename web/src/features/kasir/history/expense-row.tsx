import type { DrawerExpense } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { BADGE, clockLabel } from "./clock";

type Props = { expense: DrawerExpense; onCancel: () => void };

/** Baris kas keluar di Riwayat shift ini (S10): tanpa struk, hanya batal beralasan. */
export function ExpenseRow({ expense, onCancel }: Props) {
  const cancelled = expense.status === "dibatalkan";
  const time = clockLabel(expense.at);
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="font-medium break-words">{`Kas keluar · ${expense.reason}`}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="num text-muted">{time}</span>
          <span className={cancelled ? "num line-through" : "num"}>
            {formatRupiah(expense.amount)}
          </span>
          {cancelled && <span className={BADGE}>Dibatalkan</span>}
        </p>
      </div>
      {!cancelled && (
        <Button
          variant="outline"
          className="shrink-0"
          aria-label={`Batalkan kas keluar ${time}`}
          onClick={onCancel}
        >
          Batalkan
        </Button>
      )}
    </li>
  );
}
