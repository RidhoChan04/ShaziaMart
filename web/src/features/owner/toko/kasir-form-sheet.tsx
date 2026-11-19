import { CircleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { ApiError } from "@/shared/api/fetcher";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

export const NAME_MAX = 30;
const NAME_TAKEN_TEXT = "Nama sudah dipakai";

/** Nama valid: 1..30 karakter setelah dirapikan. */
export const nameValid = (name: string): boolean => {
  const length = [...name.trim()].length;
  return length >= 1 && length <= NAME_MAX;
};

/** Teks galat akun kasir: 409 NAME_TAKEN dan 422 dari server; selebihnya `pesanError`. */
export function pesanKasir(error: unknown): string {
  if (error instanceof ApiError && error.code === "NAME_TAKEN") {
    return NAME_TAKEN_TEXT;
  }
  return pesanError(error);
}

/** Baris isian berlabel dengan teks galat di bawahnya (ikon + teks, bukan warna saja). */
export function FieldRow({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null | undefined;
  children: (props: {
    id: string;
    invalid: boolean;
    describedBy: string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-galat`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      {children({
        id,
        invalid: Boolean(error),
        describedBy: error ? errorId : undefined,
      })}
      {error && (
        <p
          id={errorId}
          className="flex items-center gap-1 text-[13px] font-medium text-danger"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = (invalid: boolean) =>
  cn(
    "h-11 w-full rounded-md border border-border bg-transparent px-3 text-[17px] outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary",
    invalid && "border-danger",
  );

/** Isian nama akun. */
export function NameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string | null | undefined;
}) {
  return (
    <FieldRow label="Nama" error={error}>
      {({ id, invalid, describedBy }) => (
        <input
          id={id}
          value={value}
          autoComplete="off"
          maxLength={NAME_MAX}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass(invalid)}
        />
      )}
    </FieldRow>
  );
}

/** Status isian PIN 6 angka + ulangi PIN; PIN tidak pernah dibaca dari server dan dikosongkan saat lembar dibuka. */
export function usePinFields() {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const mismatch = again !== "" && again !== pin;
  return {
    pin,
    again,
    setPin: (v: string) => setPin(v.replace(/\D/g, "").slice(0, 6)),
    setAgain: (v: string) => setAgain(v.replace(/\D/g, "").slice(0, 6)),
    clear: () => {
      setPin("");
      setAgain("");
    },
    mismatch,
    valid: /^\d{6}$/.test(pin) && pin === again,
  };
}

export function PinFields({
  fields,
  pinLabel = "PIN 6 angka",
}: {
  fields: ReturnType<typeof usePinFields>;
  pinLabel?: string;
}) {
  return (
    <>
      <FieldRow label={pinLabel}>
        {({ id }) => (
          <input
            id={id}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={fields.pin}
            onChange={(e) => fields.setPin(e.target.value)}
            className={cn(inputClass(false), "tracking-[0.3em]")}
          />
        )}
      </FieldRow>
      <FieldRow
        label="Ulangi PIN"
        error={fields.mismatch ? "PIN tidak sama" : null}
      >
        {({ id, invalid, describedBy }) => (
          <input
            id={id}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={fields.again}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => fields.setAgain(e.target.value)}
            className={cn(inputClass(invalid), "tracking-[0.3em]")}
          />
        )}
      </FieldRow>
    </>
  );
}

/** Lembar bawah berformulir: judul, isian, galat server, Simpan, Batal. Fokus kembali ke pemicu saat ditutup. */
export function KasirFormSheet({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  submitLabel,
  canSubmit,
  pending,
  error,
  onSubmit,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitLabel: string;
  canSubmit: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit && !pending) onSubmit();
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">{title}</SheetTitle>
        {description ? (
          <SheetDescription>{description}</SheetDescription>
        ) : (
          <SheetDescription className="sr-only">{title}</SheetDescription>
        )}
        <form onSubmit={submit} className="grid gap-3" noValidate>
          {children}
          {error !== null && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="h-12 w-full text-[17px]"
            disabled={!canSubmit || pending}
          >
            {submitLabel}
          </Button>
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-[17px]"
              disabled={pending}
            >
              Batal
            </Button>
          </SheetClose>
        </form>
      </SheetContent>
    </Sheet>
  );
}
