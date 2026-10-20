import { useId, useState } from "react";
import { formatAngka, parseRupiah } from "@/shared/lib/money";
import { Input } from "@/shared/ui/input";

const NOTES = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000];

/** Jumlah lembar per pecahan + nominal koin → total uang fisik. */
export function DenominationCalculator({
  onTotal,
}: {
  onTotal: (total: number) => void;
}) {
  const [sheets, setSheets] = useState<Record<number, string>>({});
  const [coins, setCoins] = useState("");

  const report = (nextSheets: Record<number, string>, nextCoins: string) => {
    const notes = NOTES.reduce(
      (sum, note) => sum + note * Number(nextSheets[note] || 0),
      0,
    );
    const total = notes + (parseRupiah(nextCoins) ?? 0);
    if (Number.isSafeInteger(total)) onTotal(total);
  };

  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
      {NOTES.map((note) => (
        <CountField
          key={note}
          label={formatAngka(note)}
          value={sheets[note] ?? ""}
          onChange={(raw) => {
            const next = { ...sheets, [note]: raw.replace(/\D/g, "") };
            setSheets(next);
            report(next, coins);
          }}
        />
      ))}
      <CountField
        label="Koin"
        value={coins}
        onChange={(raw) => {
          setCoins(raw);
          report(sheets, raw);
        }}
      />
    </div>
  );
}

function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
      <label htmlFor={id} className="text-right text-sm tabular-nums">
        {label}
      </label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular-nums"
      />
    </div>
  );
}
