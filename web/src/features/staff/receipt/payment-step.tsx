import type {
  DrawerShift,
  ReceiptError,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import type { DraftPayment, ReceiptForm } from "../drafts/draft-types";
import { formTotal, lineCount } from "./form-model";
import { Card, FieldError, SectionHeading } from "./form-ui";
import { PaymentFields } from "./payment-fields";

type Props = {
  form: ReceiptForm;
  errors: readonly ReceiptError[];
  /** null = tidak ada shift buka. */
  shift: DrawerShift | null;
  /** Shift belum diketahui (memuat/gagal): pilihan laci tetap bisa dipilih, server memutuskan. */
  shiftUnknown: boolean;
  busy: boolean;
  /** Ubah nota: tombol simpan, ringkasan hanya-baca bila pembayaran terkunci, dan catatan di bawah tombol. */
  edit?: {
    fixedPayment: string | null;
    note: string | null;
    offline: boolean;
    /** Galat pembayaran dari server saat pembayaran terkunci (tanpa isian). */
    errors?: readonly string[];
  };
  onPayment: (change: (p: DraftPayment) => DraftPayment) => void;
  onBack: () => void;
  onSave: () => void;
};

export function PaymentStep({
  form,
  errors,
  shift,
  shiftUnknown,
  busy,
  edit,
  onPayment,
  onBack,
  onSave,
}: Props) {
  const total = formTotal(form);

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
      {edit?.fixedPayment ? (
        <Card>
          <p className="flex min-h-14 items-center px-4 font-medium">
            {edit.fixedPayment}
          </p>
          <FieldError messages={edit.errors ?? []} />
        </Card>
      ) : (
        <PaymentFields
          form={form}
          errors={errors}
          shift={shift}
          shiftUnknown={shiftUnknown}
          onPayment={onPayment}
        />
      )}

      <div className="mt-5 grid gap-2">
        <Button
          onClick={onSave}
          disabled={busy || edit?.offline === true}
          className="w-full"
        >
          {edit ? "Simpan perubahan" : "Simpan barang masuk"}
        </Button>
        {edit?.note && (
          <p className="px-1 text-center text-[13px] text-muted">{edit.note}</p>
        )}
        <Button variant="ghost" onClick={onBack} className="w-full">
          Kembali ke nota
        </Button>
      </div>
    </>
  );
}
