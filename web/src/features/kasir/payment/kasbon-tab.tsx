import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { CustomerPicker } from "./customer-picker";

/** Pilih pelanggan, lalu pratinjau saldo kasbon setelah transaksi ini. */
export function KasbonFields({
  credit,
  customer,
  onCustomer,
}: {
  credit: number | null;
  customer: Customer | null;
  onCustomer: (customer: Customer | null) => void;
}) {
  const after = customer && credit !== null ? customer.balance + credit : null;
  return (
    <div className="grid gap-2">
      <CustomerPicker value={customer} onChange={onCustomer} />
      {customer && after !== null && (
        <p className="text-sm tabular-nums">
          {`Saldo setelah kasbon ${formatRupiah(after)}`}
          {after > customer.creditLimit && (
            <span className="block font-medium text-warning">
              Melebihi limit — perlu PIN pemilik
            </span>
          )}
        </p>
      )}
    </div>
  );
}
