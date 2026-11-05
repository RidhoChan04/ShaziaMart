import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { formatGram, parseKg } from "@/shared/lib/quantity";
import { countedQtyBase, unitLabel } from "@/shared/lib/stock-rules";

export type CounterUnit = { id: string; name: string; unitSize: number };

type Props = {
  /** Urut besar dulu (dus, lalu pcs). */
  units: CounterUnit[];
  baseUnitName: string;
  isCurah: boolean;
  /** Jumlah dalam satuan dasar. */
  value: number;
  onChange: (qtyBase: number) => void;
  /** Sembunyikan baris ringkas `Jumlah fisik = …` (mis. bila jumlah sudah tampil di tombol). */
  hideTotal?: boolean;
};

const stepButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";

/** Pecah jumlah dasar ke tiap satuan, besar dulu; sisa jatuh ke satuan terakhir. */
function decompose(units: readonly CounterUnit[], value: number): number[] {
  let rest = value;
  return units.map((u, i) => {
    if (i === units.length - 1) return rest;
    const n = Math.floor(rest / u.unitSize);
    rest -= n * u.unitSize;
    return n;
  });
}

const sum = (units: readonly CounterUnit[], counts: readonly number[]) =>
  countedQtyBase(
    units.map((u, i) => ({ unitSize: u.unitSize, count: counts[i] ?? 0 })),
  );

function Summary({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-3">
      <span className="text-[15px] font-medium">Jumlah fisik</span>
      <output className="text-[18px] font-bold tabular-nums">{children}</output>
    </div>
  );
}

function CountRow({
  unit,
  hint,
  count,
  onCount,
}: {
  unit: CounterUnit;
  hint: string;
  count: number;
  onCount: (n: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const label = unitLabel(unit.name);
  const set = (n: number) => {
    setTyped(null);
    if (Number.isSafeInteger(n) && n >= 0) onCount(n);
  };
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <div className="text-[17px] font-semibold">{label}</div>
        <div className="text-[13px] text-muted">{hint}</div>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Kurangi ${label}`}
          disabled={count <= 0}
          onClick={() => set(count - 1)}
          className={stepButton}
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Jumlah ${label}`}
          value={typed ?? String(count)}
          onChange={(e) => {
            const digits = e.target.value
              .replace(/\D/g, "")
              .replace(/^0+(?=\d)/, "")
              .slice(0, 9);
            setTyped(digits);
            onCount(digits === "" ? 0 : Number(digits));
          }}
          onFocus={(e) => e.target.select()}
          onBlur={() => setTyped(null)}
          className="h-11 w-14 min-w-0 rounded-md bg-transparent text-center text-[20px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="button"
          aria-label={`Tambah ${label}`}
          onClick={() => set(count + 1)}
          className={stepButton}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}

/** Curah: isian kg/liter (`1,5` → 1500 gram/ml). Isian tidak sah tidak mengubah nilai. */
function CurahInput({
  baseUnitName,
  value,
  onChange,
  hideTotal,
}: Omit<Props, "units" | "isCurah">) {
  const id = useId();
  const liquid = baseUnitName === "ml";
  const label = liquid ? "Isi (liter)" : "Berat (kg)";
  const unit = liquid ? "L" : "kg";
  const [typed, setTyped] = useState<string | null>(null);
  const shown =
    typed ?? (value === 0 ? "" : formatGram(value, unit).replace(/ \S+$/, ""));
  return (
    <div className="grid gap-2">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
        <label htmlFor={id} className="text-[17px] font-semibold">
          {label}
        </label>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={shown}
          onChange={(e) => {
            const text = e.target.value;
            if (!/^[\d.,]*$/.test(text)) return;
            setTyped(text);
            if (text.trim() === "" || /^0+(?:[.,]0{0,3})?$/.test(text.trim())) {
              onChange(0);
              return;
            }
            const gram = parseKg(text);
            if (gram !== null) onChange(gram);
          }}
          onBlur={() => setTyped(null)}
          className={cn(
            "h-11 w-28 min-w-0 rounded-md border border-border bg-surface px-3 text-right text-[20px] font-semibold tabular-nums outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary",
          )}
        />
      </div>
      {!hideTotal && <Summary>{`= ${formatGram(value, unit)}`}</Summary>}
    </div>
  );
}

/**
 * Penghitung jumlah fisik: satu baris per satuan (dus, pcs…) dengan tombol kurang/tambah dan isian angka;
 * `qtyBase = Σ jumlah × isi satuan`. Barang curah memakai isian kg/liter.
 */
export function UnitCounter({
  units,
  baseUnitName,
  isCurah,
  value,
  onChange,
  hideTotal = false,
}: Props) {
  // Angka per satuan disimpan agar "45 pcs" tidak langsung berubah jadi dus saat diketik.
  const [counts, setCounts] = useState<number[]>(() => decompose(units, value));
  if (isCurah) {
    return (
      <CurahInput
        baseUnitName={baseUnitName}
        value={value}
        onChange={onChange}
        hideTotal={hideTotal}
      />
    );
  }
  const effective =
    counts.length === units.length && sum(units, counts) === value
      ? counts
      : decompose(units, value);
  const last = units.length - 1;
  return (
    <div className="grid gap-2">
      <div className="divide-y divide-border rounded-lg bg-surface">
        {units.map((u, i) => (
          <CountRow
            key={u.id}
            unit={u}
            hint={
              i === last
                ? "lepasan"
                : `isi ${u.unitSize} ${units[last]?.name ?? baseUnitName}`
            }
            count={effective[i] ?? 0}
            onCount={(n) => {
              const next = effective.map((c, j) => (j === i ? n : c));
              setCounts(next);
              onChange(sum(units, next));
            }}
          />
        ))}
      </div>
      {!hideTotal && <Summary>{`= ${value} ${baseUnitName}`}</Summary>}
    </div>
  );
}
