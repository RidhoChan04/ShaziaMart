import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { toast } from "sonner";
import {
  getGetOwnerSettingsQueryKey,
  useUpdateOwnerSettings,
} from "@/shared/api/gen/owner/owner";
import type { OwnerSettingsPatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { formatAngka } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";

export const NUMBER_ERROR = "Isi dengan bilangan bulat";

/** Bilangan bulat dari ketikan (titik ribuan boleh); selain itu `null`. */
export function toInt(text: string): number | null {
  const s = text.trim().replaceAll(".", "");
  if (!/^\d{1,15}$/.test(s)) return null;
  return Number(s);
}

/** Semua ketikan jadi bilangan bulat, atau `null` bila ada yang bukan. */
export function toInts(texts: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const text of texts) {
    const n = toInt(text);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/** Simpan satu bagian: kirim hanya bagian itu, ganti cache Pengaturan, tampilkan pesan atau galat server. */
export function useSaveSection() {
  const queryClient = useQueryClient();
  const mutation = useUpdateOwnerSettings({
    mutation: {
      onSuccess: (saved) => {
        queryClient.setQueryData(getGetOwnerSettingsQueryKey(), saved);
        toast.success("Pengaturan disimpan");
      },
    },
  });
  return {
    save: (patch: OwnerSettingsPatch) => {
      mutation.mutate({ data: patch });
    },
    pending: mutation.isPending,
    serverError: mutation.isError ? pesanError(mutation.error) : null,
    reset: mutation.reset,
  };
}

/** Bentuk satu bagian: kartu isian, galat server di dalam kartu, tombol Simpan sendiri. */
export function SectionForm({
  onSubmit,
  pending,
  error,
  errorId,
  children,
}: {
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      className="grid gap-4 lg:max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-4 rounded-lg bg-surface p-4">
        {children}
        {error !== null && (
          <p
            id={errorId}
            role="alert"
            className="text-[14px] font-medium text-danger"
          >
            {error}
          </p>
        )}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full text-[17px]"
      >
        Simpan
      </Button>
    </form>
  );
}

const inputClass =
  "h-11 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-right text-[17px] tabular-nums outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-danger aria-invalid:text-danger";

/** Isian angka dengan awalan (Rp) atau akhiran (jam, %, hari). */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  invalid,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  suffix?: string;
  invalid: boolean;
  describedBy?: string | undefined;
}) {
  const id = useId();
  const localInvalid = toInt(value) === null;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-[15px] text-muted">{prefix}</span>}
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={invalid || localInvalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const n = toInt(value);
            if (n !== null) onChange(formatAngka(n));
          }}
          className={cn(inputClass)}
        />
        {suffix && <span className="text-[15px] text-muted">{suffix}</span>}
      </div>
      {localInvalid && (
        <p className="text-[13px] font-medium text-danger">{NUMBER_ERROR}</p>
      )}
    </div>
  );
}

/** Isian teks satu baris (nama, alamat, nomor). */
export function TextField({
  label,
  value,
  onChange,
  invalid,
  describedBy,
  hint,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
  describedBy?: string | undefined;
  hint?: string | undefined;
  inputMode?: "tel" | "text";
  placeholder?: string | undefined;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        value={value}
        autoComplete="off"
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          [describedBy, hint ? hintId : undefined].filter(Boolean).join(" ") ||
          undefined
        }
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-border bg-transparent px-3 text-[17px] outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-danger"
      />
      {hint && (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Sakelar berlabel (role switch) dengan keterangan kecil; tinggi sentuh ≥ 44 px. */
export function SwitchField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const hintId = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {hint && (
          <span id={hintId} className="text-[13px] text-muted">
            {hint}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => onChange(!checked)}
        className="relative -my-1.5 h-11 w-[68px] shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 left-1/2 h-[31px] w-[51px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors motion-reduce:transition-none",
            checked ? "bg-primary" : "bg-border",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 left-1/2 size-[27px] -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
            checked ? "translate-x-[1px]" : "-translate-x-[23px]",
          )}
        />
      </button>
    </div>
  );
}
