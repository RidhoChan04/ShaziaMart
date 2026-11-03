import type {
  DrawerShift,
  ReceiptError,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { addIsoDays } from "@/shared/lib/business-day";
import {
  CASH_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_TIMING_LABEL,
} from "@/shared/lib/payment-labels";
import type { DraftPayment, ReceiptForm } from "../drafts/draft-types";
import { DateRow } from "./date-row";
import { DUE_CHIPS, drawerNote, formTotal } from "./form-model";
import { Card, FieldError, Segmented } from "./form-ui";

const messagesFor = (errors: readonly ReceiptError[], ...fields: string[]) =>
  errors
    .filter((e) => e.lineId === null && fields.includes(e.field))
    .map((e) => e.message);

/** Isian pembayaran (kapan, cara, sumber uang, jatuh tempo) dan catatannya. */
export function PaymentFields({
  form,
  errors,
  shift,
  shiftUnknown,
  onPayment,
}: {
  form: ReceiptForm;
  errors: readonly ReceiptError[];
  shift: DrawerShift | null;
  shiftUnknown: boolean;
  onPayment: (change: (p: DraftPayment) => DraftPayment) => void;
}) {
  const p = form.payment;
  const total = formTotal(form);
  const laterNow = p.timing === "nanti";
  const laciOk = shift !== null || shiftUnknown;
  const note =
    laciOk && shift && total !== null ? drawerNote(shift, total) : null;
  const cashErr = messagesFor(errors, "cashSource");

  return (
    <>
      <Card>
        <Segmented
          name="timing"
          label="Kapan dibayar"
          value={p.timing}
          options={[
            { value: "sekarang", label: PAYMENT_TIMING_LABEL.sekarang },
            { value: "nanti", label: PAYMENT_TIMING_LABEL.nanti },
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
    </>
  );
}
