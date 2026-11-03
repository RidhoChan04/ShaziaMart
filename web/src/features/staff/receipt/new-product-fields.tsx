import { useState } from "react";
import type { ReceiptField } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { ScanButton } from "@/shared/components/scan/scan-button";
import { cn } from "@/shared/lib/cn";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { BIG_UNITS, SMALL_UNITS } from "@/shared/lib/units";

export type NewProductDraft = NonNullable<DraftLine["newProduct"]>;
export type FieldErrors = Partial<Record<ReceiptField, string>>;

export const fieldId = (field: ReceiptField): string => `lb-${field}`;

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-[17px] outline-none placeholder:text-muted/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-danger";

type FieldProps = {
  field: ReceiptField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  list?: string;
  inputMode?: "numeric";
  note?: string | undefined;
  trailing?: React.ReactNode;
};

function Field({
  field,
  label,
  value,
  onChange,
  error,
  list,
  inputMode,
  note,
  trailing,
}: FieldProps) {
  const id = fieldId(field);
  const describedBy =
    [note ? `${id}-note` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={id}
          value={value}
          list={list}
          inputMode={inputMode}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "flex-1")}
        />
        {trailing}
      </div>
      {note && (
        <p id={`${id}-note`} className="text-[13px] text-muted">
          {note}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type Props = {
  value: NewProductDraft;
  onChange: (value: NewProductDraft) => void;
  errors: FieldErrors;
};

/** Kamera menutup tanpa memulihkan fokus bila barcode terbaca; kembalikan ke isian barcode. */
const focusBarcode = () =>
  setTimeout(() => document.getElementById(fieldId("newBarcode"))?.focus(), 0);

const sameUnit = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Isian barang yang belum terdaftar; "Satuan di nota" mengikuti "Dijual per" sampai diubah sendiri. */
export function NewProductFields({ value, onChange, errors }: Props) {
  const [notaTouched, setNotaTouched] = useState(
    value.notaUnit !== "" && value.notaUnit !== value.sellUnit,
  );
  const set = (patch: Partial<NewProductDraft>) =>
    onChange({ ...value, ...patch });
  const showSize =
    value.notaUnit.trim() !== "" && !sameUnit(value.notaUnit, value.sellUnit);
  return (
    <section aria-label="Barang baru" className="grid gap-3">
      <Field
        field="newName"
        label="Nama"
        value={value.name}
        onChange={(name) => set({ name })}
        error={errors.newName}
      />
      <Field
        field="newSellUnit"
        label="Dijual per"
        value={value.sellUnit}
        list="lb-satuan-kecil"
        onChange={(sellUnit) =>
          set(notaTouched ? { sellUnit } : { sellUnit, notaUnit: sellUnit })
        }
        error={errors.newSellUnit}
      />
      <Field
        field="newNotaUnit"
        label="Satuan di nota"
        value={value.notaUnit}
        list="lb-satuan-besar"
        onChange={(notaUnit) => {
          setNotaTouched(true);
          set({ notaUnit });
        }}
        error={errors.newNotaUnit}
      />
      {showSize && (
        <Field
          field="newNotaUnitSize"
          label="Isi"
          value={value.notaUnitSize}
          inputMode="numeric"
          onChange={(notaUnitSize) =>
            set({ notaUnitSize: notaUnitSize.replace(/\D/g, "") })
          }
          note={`${value.sellUnit.trim()} per ${value.notaUnit.trim()}`}
          error={errors.newNotaUnitSize}
        />
      )}
      <Field
        field="newBarcode"
        label="Barcode"
        value={value.barcode}
        inputMode="numeric"
        onChange={(barcode) => set({ barcode })}
        error={errors.newBarcode}
        trailing={
          <ScanButton
            label="Scan barcode dengan kamera"
            purpose="eceran"
            onDetected={(barcode) => {
              set({ barcode });
              focusBarcode();
            }}
            onManual={focusBarcode}
          />
        }
      />
      <p className="text-[13px] text-muted">
        Harga jual diisi pemilik. Barang ini belum bisa dijual di kasir sampai
        harga jual diisi.
      </p>
      <datalist id="lb-satuan-kecil">
        {SMALL_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="lb-satuan-besar">
        {BIG_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </section>
  );
}
