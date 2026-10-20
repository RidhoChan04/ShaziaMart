import { type ComponentProps, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

const PIN_LENGTH = 6;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

type Props = {
  /** Dipanggil otomatis saat 6 digit lengkap; isian lalu dikosongkan. */
  onComplete: (pin: string) => void;
  pending: boolean;
  error: string | null;
};

/** PIN 6 digit: tombol layar atau keyboard fisik, tampil sebagai titik. */
export function PinPad({ onComplete, pending, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const change = (next: string) => {
    const digits = next.replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (digits.length === PIN_LENGTH) {
      setPin("");
      onComplete(digits);
    } else {
      setPin(digits);
    }
  };
  const press = (next: string) => {
    if (!pending) change(next);
    inputRef.current?.focus();
  };

  return (
    <div className="grid justify-items-center gap-4">
      <div className="relative flex gap-3 rounded-lg px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
        <input
          ref={inputRef}
          aria-label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          readOnly={pending}
          value={pin}
          onChange={(e) => change(e.target.value)}
          className="absolute inset-0 opacity-0"
        />
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: posisi titik tetap
            key={i}
            aria-hidden
            className={cn(
              "size-4 rounded-full border-2 border-primary",
              i < pin.length && "bg-primary",
            )}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((d) => (
          <PadButton key={d} disabled={pending} onClick={() => press(pin + d)}>
            {d}
          </PadButton>
        ))}
        <PadButton
          className="col-start-2"
          disabled={pending}
          onClick={() => press(`${pin}0`)}
        >
          0
        </PadButton>
        <PadButton
          disabled={pending}
          onClick={() => press(pin.slice(0, -1))}
          className="text-[15px]"
        >
          Hapus
        </PadButton>
      </div>
    </div>
  );
}

function PadButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={cn("h-14 w-20 text-xl tabular-nums", className)}
      {...props}
    />
  );
}
