import type {
  DrawerShift,
  ReceiptError,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { addIsoDays } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import {
  CASH_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import type { DraftPayment, ReceiptForm } from "../drafts/draft-types";
import { DateRow } from "./date-row";
import { DUE_CHIPS, drawerNote, formTotal, lineCount } from "./form-model";
import { Card, FieldError, SectionHeading, Segmented } from "./form-ui";

type Props = {
  form: ReceiptForm;
  errors: readonly ReceiptError[];
  /** null = tidak ada shift buka. */
  shift: DrawerShift | null;
  /** Shift belum diketahui (memuat/gagal): pilihan laci tetap bisa dipilih, server memutuskan. */
  shiftUnknown: boolean;
  busy: boolean;
  onPayment: (change: (p: DraftPayment) => DraftPayment) => void;
  onBack: () => void;
  onSave: () => void;
};

const messagesFor = (errors: readonly ReceiptError[], ...fields: string[]) =>
  errors
    .filter((e) => e.lineId === null && fields.includes(e.field))
    .map((e) => e.message);

export function PaymentStep({
  form,
  errors,
  shift,
  shiftUnknown,
  busy,
  onPayment,
  onBack,
  onSave,
}: Props) {
  const p = form.payment;
  const total = formTotal(form);
  const laterNow = p.timing === "nanti";
  const laciOk = shift !== null || shiftUnknown;
  const note =
    laciOk && shift && total !== null ? drawerNote(shift, total) : null;
  const cashErr = messagesFor(errors, "cashSource");

  return (
    <>
      <SectionHeading>Total</SectionHeading>
      <Card>
        <p className="flex min-h-14 items-center justify-between gap-3 px-4">
          <span>{`${lineCount(form)} barang`}</span>
          <b className="text-[20px] tabular-nums">
            {total === null ? "—" : formatRupiah(total)}
          </b>
        </p>
      </Card>
      <p className="mt-1.5 px-1 text-[13px] text-muted">
        Sudah sama dengan total di nota? Kalau beda, periksa jumlah dan harga
        per baris.
      </p>

      <SectionHeading>Pembayaran</SectionHeading>
      <Card>
        <Segmented
          name="timing"
          label="Kapan dibayar"
          value={p.timing}
          options={[
            { value: "sekarang", label: "Bayar sekarang" },
            { value: "nanti", label: "Bayar nanti" },
          ]}
          onChange={(timing) =>
            onPayment((x) => ({
              ...x,
              timing,
              dueDate:
                timing === "sekarang"
                  ? null
                  : (x.dueDate ?? addIsoDays(form.notaDate, 14)),
            }))
          }
        />
        {!laterNow && (
          <Segmented
            name="method"
            label="Cara bayar"
            value={p.method}
            options={[
              { value: "tunai", label: PAYMENT_METHOD_LABEL.tunai },
              { value: "transfer", label: PAYMENT_METHOD_LABEL.transfer },
            ]}
            onChange={(method) => onPayment((x) => ({ ...x, method }))}
          />
        )}
        {!laterNow && p.method === "tunai" && (
          <>
            <Segmented
              name="source"
              label="Uang dari"
              value={p.cashSource === "laci" && !laciOk ? null : p.cashSource}
              options={[
                {
                  value: "laci",
                  label: CASH_SOURCE_LABEL.laci,
                  disabled: !laciOk,
                },
                { value: "pemilik", label: CASH_SOURCE_LABEL.pemilik },
              ]}
              note={laciOk ? undefined : "Tidak ada shift buka"}
              onChange={(cashSource) =>
                onPayment((x) => ({ ...x, cashSource }))
              }
            />
            <FieldError messages={cashErr} />
          </>
        )}
        {laterNow && (
          <>
            <DateRow
              label="Jatuh tempo"
              value={p.dueDate ?? ""}
              min={form.notaDate}
              invalid={messagesFor(errors, "dueDate").length > 0}
              onChange={(dueDate) => onPayment((x) => ({ ...x, dueDate }))}
            />
            <FieldError messages={messagesFor(errors, "dueDate")} />
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {DUE_CHIPS.map((days) => {
                const date = addIsoDays(form.notaDate, days);
                return (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={p.dueDate === date}
                    onClick={() => onPayment((x) => ({ ...x, dueDate: date }))}
                    className="inline-flex h-11 min-w-16 items-center justify-center rounded-full border border-border px-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary"
                  >
                    {`${days} hari`}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <FieldError messages={messagesFor(errors, "payment")} />
      </Card>
      {!laterNow && p.method === "tunai" && note && (
        <p className="mt-1.5 px-1 text-[13px] text-muted">{note}</p>
      )}
      {laterNow && (
        <p className="mt-1.5 px-1 text-[13px] text-muted">
          Nota masuk daftar <b>Utang supplier</b> di aplikasi pemilik. Cara
          bayar dipilih saat pemilik menandai lunas.
        </p>
      )}

      <div className="mt-5 grid gap-2">
        <Button onClick={onSave} disabled={busy} className="w-full">
          Simpan barang masuk
        </Button>
        <Button variant="ghost" onClick={onBack} className="w-full">
          Kembali ke nota
        </Button>
      </div>
    </>
  );
}
