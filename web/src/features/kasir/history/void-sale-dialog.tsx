import { useState } from "react";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { saleMethodLabel } from "@/shared/lib/payment-labels";
import { ReasonDialog } from "../common/reason-dialog";

type QrisSource = "laci" | "pemilik";

const SOURCES: { value: QrisSource; label: string }[] = [
  { value: "laci", label: "Tunai dari laci" },
  { value: "pemilik", label: "Transfer oleh pemilik nanti" },
];

type Props = {
  /** Riwayat = `Sale`; cari struk lama = `KasirLookupSale` (dengan nama pelanggan). */
  sale: (Sale & { customerName?: string | null }) | null;
  /** Transaksi dari shift yang sudah tutup (ruling R12): kalimat uang laci & kasbon. */
  fromClosedShift: boolean;
  pending: boolean;
  error?: string | undefined;
  onSubmit: (reason: string, qrisRefundSource: QrisSource | null) => void;
  onCancel: () => void;
  /** Lihat `ReasonDialog`: ke mana fokus pergi bila baris pemicu sudah hilang. */
  onCloseAutoFocus?: (e: Event) => void;
  /** (R11) Nomor pemilik; dibaca pemanggil dari pengaturan kasir. */
  ownerPhone?: string | null;
};

const amountOf = (sale: Sale, method: "cash" | "qris" | "credit") =>
  sale.payments.find((p) => p.method === method)?.amount ?? 0;

function QrisChoice({
  amount,
  value,
  disabled,
  onChange,
}: {
  amount: number;
  value: QrisSource;
  disabled: boolean;
  onChange: (value: QrisSource) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium tabular-nums">
        {`Kembalikan QRIS ${formatRupiah(amount)}`}
      </legend>
      <div className="flex gap-1.5">
        {SOURCES.map((s) => (
          <label
            key={s.value}
            className={cn(
              "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md border px-3 text-center text-[15px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary",
              value === s.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name="qris-refund"
              value={s.value}
              checked={value === s.value}
              disabled={disabled}
              onChange={() => onChange(s.value)}
              className="sr-only"
            />
            {s.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Batal transaksi di kasir (ruling R4/R12, koreksi mockup M1): alasan wajib; bila ada bagian
 * QRIS kasir memilih `Tunai dari laci` (bawaan) atau `Transfer oleh pemilik nanti`. Dipakai
 * Riwayat shift ini (`fromClosedShift` false) dan cari struk lama (true).
 */
export function VoidSaleDialog({
  sale,
  fromClosedShift,
  pending,
  error,
  onSubmit,
  onCancel,
  onCloseAutoFocus,
  ownerPhone,
}: Props) {
  const [source, setSource] = useState<QrisSource>("laci");
  const [shownId, setShownId] = useState<string | null>(null);
  // Setiap transaksi yang dibuka mulai dari pilihan bawaan.
  if (sale && sale.id !== shownId) {
    setShownId(sale.id);
    setSource("laci");
  }
  const cash = sale ? amountOf(sale, "cash") : 0;
  const qris = sale ? amountOf(sale, "qris") : 0;
  const credit = sale ? amountOf(sale, "credit") : 0;

  let description = "";
  if (sale && !fromClosedShift) {
    description = `${saleMethodLabel(sale.payments)} · ${formatRupiah(sale.total)}`;
  } else if (cash > 0) {
    description = `Tunai ${formatRupiah(cash)} dikembalikan dari laci shift ini.`;
  }

  return (
    <ReasonDialog
      open={sale !== null}
      title={sale ? `Batalkan ${sale.number}?` : ""}
      description={description}
      confirmLabel="Batalkan transaksi"
      confirmTone="danger"
      pending={pending}
      error={error}
      onCancel={onCancel}
      ownerPhone={ownerPhone ?? null}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      onSubmit={(reason) => onSubmit(reason, qris > 0 ? source : null)}
    >
      {qris > 0 && (
        <QrisChoice
          amount={qris}
          value={source}
          disabled={pending}
          onChange={setSource}
        />
      )}
      {fromClosedShift && credit > 0 && (
        <p className="text-sm tabular-nums">
          {`Kasbon ${sale?.customerName ?? "pelanggan"} dikurangi ${formatRupiah(credit)}.`}
        </p>
      )}
    </ReasonDialog>
  );
}
