import { type ReactNode, useId } from "react";
import { cn } from "@/shared/lib/cn";

/** Bagian form: judul 20px tebal di atas kartu putih bulat, catatan/petunjuk di bawahnya. */
export function FormSection({
  title,
  optional = false,
  children,
  footer,
}: {
  title: string;
  optional?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-2 flex items-baseline justify-between px-1 text-[20px] font-bold tracking-[-0.02em]"
      >
        <span>{title}</span>
        {optional && (
          <span className="text-[13px] font-medium text-muted"> opsional</span>
        )}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-lg bg-surface">
        {children}
      </div>
      {footer}
    </section>
  );
}

/** Catatan kecil di bawah kartu; `strong` untuk petunjuk untung yang berubah saat mengetik. */
export function SectionNote({
  children,
  live = false,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <p
      className={cn(
        "mt-2 px-1 text-[13px] text-muted",
        live && "font-semibold text-text tabular-nums",
      )}
    >
      {children}
    </p>
  );
}

export const fieldId = (field: string): string => `pf-${field}`;

export type TextFieldProps = {
  /** Nama field kontrak; menjadi id isian. */
  field: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Pesan galat; dihubungkan lewat aria-describedby. */
  error?: string | undefined;
  /** Keterangan tetap (mis. terkunci); dihubungkan lewat aria-describedby. */
  note?: string | undefined;
  disabled?: boolean | undefined;
  /** id `<datalist>` untuk pilihan yang boleh diabaikan. */
  list?: string | undefined;
  inputMode?: "numeric" | "decimal" | undefined;
  placeholder?: string | undefined;
  /** Satuan di kanan isian, mis. "botol"; dekoratif. */
  suffix?: string | undefined;
  /** Slot di kanan baris, mis. tombol kamera barcode. */
  trailing?: ReactNode | undefined;
};

/** Baris isian ala Settings: label di kiri, isian rata kanan, galat/keterangan di bawahnya. */
export function TextField({
  field,
  label,
  value,
  onChange,
  onBlur,
  error,
  note,
  disabled,
  list,
  inputMode,
  placeholder,
  suffix,
  trailing,
}: TextFieldProps) {
  const id = fieldId(field);
  const noteId = `${id}-note`;
  const errorId = `${id}-error`;
  const describedBy =
    [note ? noteId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="px-4 py-1.5">
      <div className="flex min-h-11 items-center gap-3">
        <label htmlFor={id} className="min-w-0 shrink text-[17px]">
          {label}
        </label>
        <input
          id={id}
          name={field}
          value={value}
          disabled={disabled}
          list={list}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn(
            "h-11 min-w-20 flex-1 rounded-md bg-transparent px-1 text-right text-[17px] tabular-nums outline-none placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:cursor-not-allowed disabled:text-muted",
            error && "text-danger",
          )}
        />
        {suffix && (
          <span aria-hidden="true" className="shrink-0 text-[17px] text-muted">
            {suffix}
          </span>
        )}
        {trailing}
      </div>
      {note && (
        <p id={noteId} className="pb-1 text-[13px] text-muted">
          {note}
        </p>
      )}
      {error && (
        <p id={errorId} className="pb-1 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
