import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";

const stepButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";

type Props = {
  id: string;
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
  describedBy?: string | undefined;
};

/** Jumlah bulat ≥ 1: tombol kurang/tambah dan isian angka; isian kosong sementara tidak mengubah nilai. */
export function QtyStepper({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
}: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  const change = (n: number) => {
    setTyped(null);
    if (Number.isSafeInteger(n) && n >= 1) onChange(n);
  };
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        aria-label="Kurangi jumlah"
        disabled={value <= 1}
        onClick={() => change(value - 1)}
        className={stepButton}
      >
        <Minus aria-hidden="true" className="size-5" />
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={typed ?? String(value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setTyped(digits);
          if (digits !== "" && Number(digits) >= 1) onChange(Number(digits));
        }}
        onBlur={() => setTyped(null)}
        className={cn(
          "h-11 w-14 min-w-0 rounded-md bg-transparent text-center text-[17px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary",
          invalid && "text-danger",
        )}
      />
      <button
        type="button"
        aria-label="Tambah jumlah"
        onClick={() => change(value + 1)}
        className={stepButton}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
