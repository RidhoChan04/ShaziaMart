import type { KasirCreditPayment } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { CREDIT_METHOD_LABEL } from "@/shared/lib/credit-rules";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { BADGE, clockLabel } from "./clock";

type Props = {
  payment: KasirCreditPayment;
  printing: boolean;
  onPrint: () => void;
  onCancel: () => void;
};

/** Baris pelunasan kasbon di Riwayat shift ini (ruling R2): cetak ulang dan batal beralasan. */
export function CreditPaymentRow({
  payment,
  printing,
  onPrint,
  onCancel,
}: Props) {
  const cancelled = payment.status === "dibatalkan";
  const time = clockLabel(payment.createdAt);
  const who = `${payment.customerName} ${time}`;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="font-medium">Pelunasan · {payment.customerName}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            {CREDIT_METHOD_LABEL[payment.method]} {time} · sisa{" "}
            {formatRupiah(payment.balanceAfter)}
          </span>
          <span className={cancelled ? "num line-through" : "num"}>
            {formatRupiah(payment.amount)}
          </span>
          {cancelled && <span className={BADGE}>Dibatalkan</span>}
          {payment.printStatus === "gagal" && (
            <span className={BADGE}>Struk gagal</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          aria-label={`Cetak ulang pelunasan ${who}`}
          disabled={cancelled || printing}
          onClick={onPrint}
        >
          Cetak ulang
        </Button>
        {!cancelled && (
          <Button
            variant="outline"
            aria-label={`Batalkan pelunasan ${who}`}
            onClick={onCancel}
          >
            Batalkan
          </Button>
        )}
      </div>
    </li>
  );
}
