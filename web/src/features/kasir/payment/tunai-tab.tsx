import { useId } from "react";
import { cn } from "@/shared/lib/cn";
import { quickCashOptions } from "@/shared/lib/denominations";
import { formatAngka, formatRupiah, parseRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

/** Kolom uang dengan awalan "Rp"; teks tampil apa adanya, diparse oleh model. */
export function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
          Rp
        </span>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-14 border-2 border-primary pl-11 text-[22px] font-bold tabular-nums"
        />
      </div>
    </div>
  );
}

/** KEMBALIAN besar, atau "KURANG Rp…" merah bila uang kurang. */
export function ChangeLine({
  change,
  shortage,
}: {
  change: number | null;
  shortage: number | null;
}) {
  if (shortage !== null) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-danger/10 px-3.5 py-3 text-xl font-bold text-danger tabular-nums"
      >
        {`KURANG ${formatRupiah(shortage)}`}
      </p>
    );
  }
  if (change === null) return null;
  return (
    <div className="flex items-center justify-between rounded-lg bg-success-soft px-3.5 py-3">
      <span className="font-semibold text-primary">KEMBALIAN</span>
      <span className="text-[32px] leading-tight font-extrabold text-primary tabular-nums">
        {formatRupiah(change)}
      </span>
    </div>
  );
}

/** UANG DITERIMA + tombol nominal cepat (Uang pas lalu 3 nominal) + kembalian. */
export function CashFields({
  due,
  text,
  onText,
  change,
  shortage,
}: {
  due: number | null;
  text: string;
  onText: (text: string) => void;
  change: number | null;
  shortage: number | null;
}) {
  const options = due === null ? [] : quickCashOptions(due);
  const received = parseRupiah(text);
  return (
    <div className="grid gap-2">
      <MoneyField label="UANG DITERIMA" value={text} onChange={onText} />
      {options.length > 0 && (
        <fieldset className="m-0 min-w-0 border-0 p-0 grid grid-cols-4 gap-1.5">
          <legend className="sr-only">Nominal cepat</legend>
          {options.map((value, i) => {
            const active = received === value;
            return (
              <Button
                key={value}
                type="button"
                variant="outline"
                aria-pressed={active}
                className={cn(
                  "px-0 tabular-nums",
                  active &&
                    "border-primary bg-primary-soft font-semibold text-primary",
                )}
                onClick={() => onText(formatAngka(value))}
              >
                {i === 0 ? "Uang pas" : formatAngka(value)}
              </Button>
            );
          })}
        </fieldset>
      )}
      <ChangeLine change={change} shortage={shortage} />
    </div>
  );
}
