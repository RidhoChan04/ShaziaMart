import { Plus } from "lucide-react";
import { useId, useState } from "react";
import type { ReceiptError } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useListStaffSuppliers } from "@/shared/api/gen/staff/staff";
import { formatRupiah } from "@/shared/lib/money";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { Button } from "@/shared/ui/button";
import type { DraftPhoto, ReceiptForm } from "../drafts/draft-types";
import { DateRow } from "./date-row";
import { formTotal, lineCount } from "./form-model";
import { Card, FieldError, SectionHeading } from "./form-ui";
import { lineSummary } from "./line-model";
import { LineSheet } from "./line-sheet";
import { PhotoField } from "./photo-field";

type Props = {
  form: ReceiptForm;
  photo: DraftPhoto | null;
  errors: readonly ReceiptError[];
  today: string;
  onForm: (change: (f: ReceiptForm) => ReceiptForm) => void;
  onPhoto: (p: DraftPhoto) => void;
  onNext: () => void;
};

const messagesFor = (
  errors: readonly ReceiptError[],
  field: string,
  lineId: string | null = null,
) =>
  errors
    .filter((e) => e.field === field && e.lineId === lineId)
    .map((e) => e.message);

function LineRow({
  line,
  errors,
  onOpen,
}: {
  line: DraftLine;
  errors: readonly string[];
  onOpen: () => void;
}) {
  const s = lineSummary(line);
  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full min-w-0 items-center justify-between gap-3 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {s.title}
            {line.newProduct && (
              <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-semibold text-warning-ink">
                Barang baru
              </span>
            )}
          </span>
          <span className="block text-[13px] text-muted tabular-nums">
            {s.detail}
          </span>
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {s.subtotal === null ? "—" : formatRupiah(s.subtotal)}
        </span>
      </button>
      <FieldError messages={errors} />
    </div>
  );
}

export function NotaStep({
  form,
  photo,
  errors,
  today,
  onForm,
  onPhoto,
  onNext,
}: Props) {
  const suppliers = useListStaffSuppliers().data ?? [];
  const listId = useId();
  const [sheet, setSheet] = useState<{ open: boolean; line: DraftLine | null }>(
    {
      open: false,
      line: null,
    },
  );
  const total = formTotal(form);
  const supplierErr = messagesFor(errors, "supplierName");
  const dateErr = messagesFor(errors, "notaDate");
  const photoErr = messagesFor(errors, "photoId");
  const noteErr = [
    ...messagesFor(errors, "lines"),
    ...errors
      .filter((e) => e.lineId === null && e.field === "payment")
      .map((e) => e.message),
  ];

  const saveLine = (line: DraftLine) =>
    onForm((f) => {
      const has = f.lines.some((l) => l.lineId === line.lineId);
      return {
        ...f,
        lines: has
          ? f.lines.map((l) => (l.lineId === line.lineId ? line : l))
          : [...f.lines, line],
      };
    });

  return (
    <>
      <SectionHeading>Nota</SectionHeading>
      <Card>
        <label className="flex min-h-12 items-center justify-between gap-3 px-4">
          <span className="shrink-0 text-[17px]">Supplier</span>
          <input
            list={listId}
            value={form.supplierName}
            onChange={(e) =>
              onForm((f) => ({ ...f, supplierName: e.target.value }))
            }
            autoComplete="off"
            aria-invalid={supplierErr.length > 0 || undefined}
            aria-describedby={
              supplierErr.length > 0 ? "err-supplier" : undefined
            }
            placeholder="Nama supplier"
            className="h-11 w-full min-w-0 flex-1 bg-transparent text-right text-[17px] font-medium text-primary outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary"
          />
          <datalist id={listId}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </label>
        <FieldError id="err-supplier" messages={supplierErr} />
        <DateRow
          label="Tanggal nota"
          value={form.notaDate}
          max={today}
          invalid={dateErr.length > 0}
          describedBy={dateErr.length > 0 ? "err-nota-date" : undefined}
          onChange={(iso) => onForm((f) => ({ ...f, notaDate: iso }))}
        />
        <FieldError id="err-nota-date" messages={dateErr} />
        <PhotoField photo={photo} onChange={onPhoto} />
        <FieldError messages={photoErr} />
      </Card>

      <SectionHeading aside={`${lineCount(form)} baris`}>Barang</SectionHeading>
      <Card>
        {form.lines.map((line) => (
          <LineRow
            key={line.lineId}
            line={line}
            errors={errors
              .filter((e) => e.lineId === line.lineId)
              .map((e) => e.message)}
            onOpen={() => setSheet({ open: true, line })}
          />
        ))}
        <button
          type="button"
          onClick={() => setSheet({ open: true, line: null })}
          className="flex min-h-12 w-full items-center gap-2 px-4 font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          <Plus aria-hidden="true" className="size-5" />
          Tambah barang
        </button>
        <FieldError messages={noteErr} />
      </Card>

      <div className="mt-5 grid gap-3 rounded-lg bg-surface p-4 shadow-sm">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-muted">Total berjalan</span>
          <b className="text-[20px] tabular-nums">
            {total === null ? "—" : formatRupiah(total)}
          </b>
        </p>
        <Button onClick={onNext} className="w-full">
          Lanjut ke pembayaran
        </Button>
      </div>

      <LineSheet
        open={sheet.open}
        line={sheet.line}
        locked={false}
        otherLines={form.lines.filter((l) => l.lineId !== sheet.line?.lineId)}
        onSave={(line) => {
          saveLine(line);
          setSheet((s) => ({ ...s, open: false }));
        }}
        onRemove={
          sheet.line
            ? () => {
                const id = sheet.line?.lineId;
                onForm((f) => ({
                  ...f,
                  lines: f.lines.filter((l) => l.lineId !== id),
                }));
                setSheet((s) => ({ ...s, open: false }));
              }
            : null
        }
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}
