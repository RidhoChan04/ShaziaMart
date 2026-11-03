import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReceiptField,
  StaffProduct,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { newId } from "@/shared/lib/id";
import { formatRupiah } from "@/shared/lib/money";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";
import {
  equivalence,
  lineProblems,
  lineSummary,
  newProductEquivalence,
  unitOptions,
} from "./line-model";
import {
  type FieldErrors,
  fieldId,
  NewProductFields,
} from "./new-product-fields";
import { ProductPicker } from "./product-picker";
import { QtyStepper } from "./qty-stepper";

type Props = {
  open: boolean;
  /** null = baris baru. */
  line: DraftLine | null;
  /** Ubah nota: barang tetap, baris tidak bisa dihapus. */
  locked: boolean;
  otherLines: readonly DraftLine[];
  onSave: (line: DraftLine) => void;
  onRemove: (() => void) | null;
  onClose: () => void;
};

/** Urutan isian di layar; fokus pergi ke yang paling atas dari yang salah. */
const FIELD_ORDER: readonly ReceiptField[] = [
  "product",
  "newName",
  "newSellUnit",
  "newNotaUnit",
  "newNotaUnitSize",
  "newBarcode",
  "unit",
  "qty",
  "unitCost",
  "expiryDate",
];

const blankLine = (): DraftLine => ({
  lineId: newId(),
  product: null,
  unitId: null,
  newProduct: null,
  qty: 1,
  unitCostText: "",
  expiryDate: null,
});

const toDraftProduct = (
  p: StaffProduct,
): NonNullable<DraftLine["product"]> => ({
  id: p.id,
  name: p.name,
  category: p.category,
  baseUnit: p.baseUnit,
  units: p.units,
});

function firstErrors(
  problems: readonly { field: ReceiptField; message: string }[],
) {
  const out: FieldErrors = {};
  for (const p of problems) out[p.field] ??= p.message;
  return out;
}

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-[17px] outline-none placeholder:text-muted/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-danger";

function ErrorText({
  id,
  message,
}: {
  id: string;
  message: string | undefined;
}) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="text-[13px] font-medium text-danger">
      {message}
    </p>
  );
}

function UnitChoice({
  product,
  unitId,
  error,
  onChange,
}: {
  product: NonNullable<DraftLine["product"]>;
  unitId: string | null;
  error: string | undefined;
  onChange: (unitId: string) => void;
}) {
  const options = unitOptions(product.units);
  return (
    <div className="grid gap-1">
      <span id="lb-unit-label" className="text-[15px] font-medium">
        Satuan di nota
      </span>
      <div
        role="radiogroup"
        aria-labelledby="lb-unit-label"
        className="flex flex-wrap gap-1 rounded-lg bg-bg p-1"
      >
        {options.map((o, i) => (
          <label key={o.unitId} className="min-w-0 flex-1">
            <input
              type="radio"
              name="lb-unit"
              id={i === 0 ? fieldId("unit") : undefined}
              checked={o.unitId === unitId}
              onChange={() => onChange(o.unitId)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center justify-center rounded-md px-3 text-center text-[15px] font-medium peer-checked:bg-surface peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      <ErrorText id="lb-unit" message={error} />
    </div>
  );
}

function AmountFields({
  draft,
  errors,
  patch,
}: {
  draft: DraftLine;
  errors: FieldErrors;
  patch: (p: Partial<DraftLine>) => void;
}) {
  const summary = lineSummary(draft);
  const options = draft.product ? unitOptions(draft.product.units) : [];
  const option = options.find((o) => o.unitId === draft.unitId);
  const eceran = draft.product?.units[0];
  const eq =
    draft.newProduct !== null
      ? newProductEquivalence(draft.qty, draft.newProduct)
      : option && eceran
        ? equivalence(draft.qty, option, eceran)
        : null;
  const unitName =
    draft.newProduct?.notaUnit.trim() ||
    draft.product?.units.find((u) => u.id === draft.unitId)?.name ||
    "satuan";

  return (
    <>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <label htmlFor={fieldId("qty")} className="text-[15px] font-medium">
            Jumlah
          </label>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3">
            {eq && (
              <span className="text-[15px] text-muted tabular-nums">{eq}</span>
            )}
            <QtyStepper
              id={fieldId("qty")}
              value={draft.qty}
              onChange={(qty) => patch({ qty })}
              invalid={Boolean(errors.qty)}
              describedBy={errors.qty ? "lb-qty-error" : undefined}
            />
          </div>
        </div>
        <ErrorText id="lb-qty" message={errors.qty} />
      </div>
      <div className="grid gap-1">
        <label
          htmlFor={fieldId("unitCost")}
          className="text-[15px] font-medium"
        >
          Harga beli / {unitName}
        </label>
        <input
          id={fieldId("unitCost")}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Rp0"
          value={draft.unitCostText}
          aria-invalid={errors.unitCost ? true : undefined}
          aria-describedby={errors.unitCost ? "lb-unitCost-error" : undefined}
          onChange={(e) => patch({ unitCostText: e.target.value })}
          className={cn(inputClass, "tabular-nums")}
        />
        <ErrorText id="lb-unitCost" message={errors.unitCost} />
      </div>
      <div className="grid gap-1">
        <div className="flex items-baseline gap-2">
          <label
            htmlFor={fieldId("expiryDate")}
            className="text-[15px] font-medium"
          >
            Kedaluwarsa
          </label>
          <small className="text-[13px] text-muted">opsional</small>
        </div>
        <input
          id={fieldId("expiryDate")}
          type="date"
          value={draft.expiryDate ?? ""}
          aria-invalid={errors.expiryDate ? true : undefined}
          aria-describedby={
            errors.expiryDate ? "lb-expiryDate-error" : undefined
          }
          onChange={(e) => patch({ expiryDate: e.target.value || null })}
          className={inputClass}
        />
        <ErrorText id="lb-expiryDate" message={errors.expiryDate} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-soft px-3 py-3">
        <span id="lb-subtotal-label" className="text-[15px] font-medium">
          Subtotal
        </span>
        <output
          aria-labelledby="lb-subtotal-label"
          className="text-[18px] font-bold tabular-nums"
        >
          {summary.subtotal === null ? "—" : formatRupiah(summary.subtotal)}
        </output>
      </div>
      <p className="text-[13px] text-muted">
        Isi tanggal ED bila ada di kemasan, agar muncul di daftar kedaluwarsa.
      </p>
    </>
  );
}

function LineForm({
  line,
  locked,
  otherLines,
  onSave,
  onRemove,
}: Omit<Props, "open" | "onClose">) {
  const [draft, setDraft] = useState<DraftLine>(() => line ?? blankLine());
  const [submitted, setSubmitted] = useState(false);
  const pendingFocus = useRef<ReceiptField | null>(null);
  const editing = line !== null;

  const errors = submitted ? firstErrors(lineProblems(draft, otherLines)) : {};
  const chosen = draft.product !== null || draft.newProduct !== null;

  useEffect(() => {
    const field = pendingFocus.current;
    if (field === null) return;
    pendingFocus.current = null;
    document.getElementById(fieldId(field))?.focus();
  });

  const patch = (p: Partial<DraftLine>) => setDraft((d) => ({ ...d, ...p }));

  const pick = useCallback((p: StaffProduct) => {
    pendingFocus.current = "qty";
    setDraft((d) => ({
      ...d,
      product: toDraftProduct(p),
      unitId: p.units.at(-1)?.id ?? null,
      newProduct: null,
    }));
  }, []);

  const startNew = useCallback((name: string) => {
    pendingFocus.current = "newSellUnit";
    setDraft((d) => ({
      ...d,
      product: null,
      unitId: null,
      newProduct: {
        name,
        sellUnit: "",
        notaUnit: "",
        notaUnitSize: "",
        barcode: "",
      },
    }));
  }, []);

  const change = () => {
    pendingFocus.current = "product";
    patch({ product: null, unitId: null, newProduct: null });
  };

  const save = () => {
    setSubmitted(true);
    const problems = lineProblems(draft, otherLines);
    if (problems.length === 0) {
      onSave(draft);
      return;
    }
    const fields = new Set(problems.map((p) => p.field));
    const first = FIELD_ORDER.find((f) => fields.has(f));
    if (first) document.getElementById(fieldId(first))?.focus();
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-4">
          {!chosen && (
            <ProductPicker
              inputId={fieldId("product")}
              error={errors.product}
              onPick={pick}
              onNew={startNew}
            />
          )}
          {chosen && (
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold">
                  {draft.product?.name ?? "Barang baru"}
                </p>
                {draft.product?.category && (
                  <p className="text-[13px] text-muted">
                    {draft.product.category}
                  </p>
                )}
              </div>
              {!locked && (
                <Button type="button" variant="ghost" onClick={change}>
                  Ganti barang
                </Button>
              )}
            </div>
          )}
          {draft.newProduct && (
            <NewProductFields
              value={draft.newProduct}
              onChange={(newProduct) => patch({ newProduct })}
              errors={errors}
            />
          )}
          {draft.product && (
            <UnitChoice
              product={draft.product}
              unitId={draft.unitId}
              error={errors.unit}
              onChange={(unitId) => patch({ unitId })}
            />
          )}
          {chosen && (
            <AmountFields draft={draft} errors={errors} patch={patch} />
          )}
        </div>
      </div>
      <div className="grid gap-1 border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button type="button" size="lg" onClick={save}>
          {editing ? "Simpan baris" : "Tambahkan ke nota"}
        </Button>
        {onRemove && !locked && (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            onClick={onRemove}
          >
            Hapus baris
          </Button>
        )}
      </div>
    </>
  );
}

/** Lembar tambah/ubah satu baris barang masuk; isian dibuang bila ditutup tanpa menyimpan. */
export function LineSheet({ open, onClose, ...rest }: Props) {
  const title = rest.line === null ? "Tambah barang" : "Ubah barang";
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[92dvh] gap-0 rounded-t-lg p-0 lg:mx-auto lg:max-w-[480px]"
        onOpenAutoFocus={() => {
          // Tanpa SheetTrigger, Radix tidak tahu ke mana fokus kembali: ke tombol yang membuka lembar.
          opener.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <SheetTitle className="text-[20px] font-bold">{title}</SheetTitle>
            <SheetDescription>
              Isi sesuai yang tertulis di nota
            </SheetDescription>
          </div>
          <SheetClose
            aria-label="Tutup"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-bg outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" className="size-5" />
          </SheetClose>
        </div>
        <LineForm {...rest} />
      </SheetContent>
    </Sheet>
  );
}
