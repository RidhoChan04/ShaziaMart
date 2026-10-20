import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { KasbonFields } from "./kasbon-tab";
import type { FirstMethod } from "./payment-model";
import { QrisPanel } from "./qris-tab";
import { CashFields, MoneyField } from "./tunai-tab";

const METHODS: { value: FirstMethod; label: string }[] = [
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
];

/** Bagian pertama tunai/QRIS, sisanya otomatis jadi kasbon pelanggan. */
export function CampuranFields({
  total,
  firstMethod,
  onFirstMethod,
  firstAmount,
  onFirstAmount,
  received,
  onReceived,
  customer,
  onCustomer,
  change,
  shortage,
}: {
  total: number;
  firstMethod: FirstMethod;
  onFirstMethod: (method: FirstMethod) => void;
  firstAmount: string;
  onFirstAmount: (text: string) => void;
  received: string;
  onReceived: (text: string) => void;
  customer: Customer | null;
  onCustomer: (customer: Customer | null) => void;
  change: number | null;
  shortage: number | null;
}) {
  const parsed = parseRupiah(firstAmount);
  const first = parsed !== null && parsed > 0 && parsed < total ? parsed : null;
  const rest = first === null ? null : total - first;

  return (
    <div className="grid gap-2">
      <fieldset className="m-0 min-w-0 border-0 p-0 grid grid-cols-2 gap-1.5">
        <legend className="mb-1 text-xs text-muted">BAGIAN PERTAMA</legend>
        {METHODS.map((m) => (
          <Button
            key={m.value}
            type="button"
            variant="outline"
            aria-pressed={firstMethod === m.value}
            className={cn(
              firstMethod === m.value &&
                "border-primary bg-primary-soft font-semibold text-primary",
            )}
            onClick={() => onFirstMethod(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </fieldset>
      <MoneyField
        label="NOMINAL DIBAYAR"
        value={firstAmount}
        onChange={onFirstAmount}
      />
      {rest !== null ? (
        <p className="font-semibold tabular-nums">{`Sisa kasbon ${formatRupiah(rest)}`}</p>
      ) : (
        parsed !== null &&
        parsed >= total && (
          <p role="alert" className="text-sm font-medium text-danger">
            Nominal harus kurang dari total
          </p>
        )
      )}
      {firstMethod === "cash" && (
        <CashFields
          due={first}
          text={received}
          onText={onReceived}
          change={change}
          shortage={shortage}
        />
      )}
      {firstMethod === "qris" && first !== null && <QrisPanel amount={first} />}
      <KasbonFields credit={rest} customer={customer} onCustomer={onCustomer} />
    </div>
  );
}
