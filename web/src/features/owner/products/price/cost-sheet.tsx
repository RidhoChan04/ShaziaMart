import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ApiError } from "@/shared/api/fetcher";
import {
  useDismissOwnerCostAlert,
  useUpdateOwnerProductPrices,
} from "@/shared/api/gen/owner/owner";
import type {
  OwnerProduct,
  PriceLineInput,
  PriceSource,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatAngka, formatRupiah, parseRupiah } from "@/shared/lib/money";
import { markup } from "@/shared/lib/product-rules";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";
import { useInvalidateProduct } from "../detail/use-invalidate-product";
import { type CostLine, costDirection, costLines } from "./cost-sheet-model";

type PriceField = "price" | "tierPrice" | "bigPrice";
type FieldMessages = Partial<Record<PriceField, string>>;

const NOT_A_NUMBER = "Ketik angka saja, mis. 3500";

const SOURCE_TEXT: Record<PriceSource, string> = {
  pemilik: "oleh Pemilik",
  impor: "lewat Impor Excel",
  barang_masuk: "lewat Barang masuk",
  ubah_nota: "lewat ubah nota",
};

/** Field galat 422 yang menunjuk baris ini: eceran `price`, grosir `tierPrice`, satuan besar `bigPrice`. */
function fieldOf(line: CostLine, eceranUnitId: string | undefined): PriceField {
  if (line.unitId !== eceranUnitId) return "bigPrice";
  return line.tierMinQty === null ? "price" : "tierPrice";
}

function isPriceField(value: unknown): value is PriceField {
  return value === "price" || value === "tierPrice" || value === "bigPrice";
}

/**
 * Kontrak `FieldError` hanya memuat `field` + `message` (tanpa indeks baris), jadi pesan dipetakan
 * per field; model barang punya satu tier grosir sehingga tidak ada dua baris berbagi field.
 * Pesan 422 per field harga; sisanya (field lain, bentuk tak dikenal) menjadi pesan umum. */
function splitErrors(error: unknown): {
  fields: FieldMessages;
  general: string | null;
} {
  const fields: FieldMessages = {};
  if (!(error instanceof ApiError) || error.status !== 422) {
    return { fields, general: pesanError(error) };
  }
  const list = (error.body as { errors?: unknown } | undefined)?.errors;
  const rest: string[] = [];
  if (Array.isArray(list)) {
    for (const e of list as { field?: unknown; message?: unknown }[]) {
      if (typeof e?.message !== "string") continue;
      if (isPriceField(e.field)) fields[e.field] ??= e.message;
      else rest.push(e.message);
    }
  }
  if (Object.keys(fields).length === 0 && rest.length === 0) {
    return { fields, general: pesanError(error) };
  }
  return { fields, general: rest[0] ?? null };
}

const percentText = (p: number | null): string => (p === null ? "–" : `${p}%`);

function deltaText(line: CostLine): string {
  const delta = line.newCost - line.oldCost;
  if (delta === 0) return "Tidak berubah";
  return `${delta > 0 ? "+" : ""}${formatRupiah(delta)}`;
}

/** `untung Rp700 (26% dari modal)` / `rugi Rp200 (7% dari modal)` untuk harga yang diketik. */
function typedNote(price: number, newCost: number): string {
  const m = markup(price, newCost);
  if (m === null) return "";
  const verb = m.profit < 0 ? "rugi" : "untung";
  const pct = m.percent === null ? "" : ` (${Math.abs(m.percent)}% dari modal)`;
  return `${verb} ${formatRupiah(Math.abs(m.profit))}${pct}`;
}

/** Keterangan di bawah isian: otomatis bila kosong, pesan bila bukan angka, selain itu untung/rugi harga ketikan. */
function noteFor(text: string, newCost: number): string {
  if (text.trim() === "") return "untung dihitung otomatis";
  const typed = parseRupiah(text);
  return typed === null ? NOT_A_NUMBER : typedNote(typed, newCost);
}

function profitDirection(line: CostLine): "Turun" | "Naik" | null {
  if (line.profitAfter < line.profitBefore) return "Turun";
  return line.profitAfter > line.profitBefore ? "Naik" : null;
}

function Block({
  line,
  source,
  changedAt,
  text,
  onText,
  error,
}: {
  line: CostLine;
  source: PriceSource;
  changedAt: number;
  text: string;
  onText: (value: string) => void;
  error: string | undefined;
}) {
  const uid = useId();
  const invalid = text.trim() !== "" && parseRupiah(text) === null;
  const by = SOURCE_TEXT[source];
  const note = noteFor(text, line.newCost);
  const direction = profitDirection(line);
  const row = "flex items-baseline justify-between gap-3 px-4 py-2.5";
  const sub = "text-[13px] text-muted tabular-nums";

  return (
    <section aria-labelledby={`${uid}-h`} className="grid gap-2">
      <h3 id={`${uid}-h`} className="px-1 text-[15px] font-semibold">
        {line.label} · {line.detail}
      </h3>
      <div className="divide-y divide-border rounded-lg bg-bg">
        <div className={row}>
          <span>Modal</span>
          <span className="text-right tabular-nums">
            <b className="block font-semibold">
              {`${formatRupiah(line.oldCost)} → ${formatRupiah(line.newCost)}`}
            </b>
            <small className={sub}>
              {`${deltaText(line)} · ${by}, ${jakartaTime(changedAt)}`}
            </small>
          </span>
        </div>
        <div className={row}>
          <span>Harga jual sekarang</span>
          <b className="font-semibold tabular-nums">
            {formatRupiah(line.price)}
          </b>
        </div>
        <div className={row}>
          <span>Untung</span>
          <span className="text-right tabular-nums">
            <b className="block font-semibold">
              {`${percentText(line.percentBefore)} → ${percentText(line.percentAfter)}`}
            </b>
            {direction !== null && (
              <small
                className={`${sub} ${direction === "Turun" ? "text-danger-ink" : ""}`}
              >
                {`${direction}: ${formatRupiah(line.profitBefore)} → ${formatRupiah(line.profitAfter)}`}
              </small>
            )}
          </span>
        </div>
      </div>
      {line.suggested !== null && (
        <p className="px-1 text-[15px] font-semibold text-primary tabular-nums">
          {`Harga saran ${formatRupiah(line.suggested)}`}
          {line.percentBefore !== null && line.percentBefore >= 0
            ? ` · untung tetap ${line.percentBefore}%`
            : ""}
        </p>
      )}
      <label
        htmlFor={`${uid}-in`}
        className="px-1 text-[13px] font-semibold text-muted"
      >
        atau ketik harga sendiri
      </label>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-muted">
          Rp
        </span>
        <Input
          id={`${uid}-in`}
          inputMode="numeric"
          autoComplete="off"
          placeholder={
            line.suggested === null ? "" : formatAngka(line.suggested)
          }
          value={text}
          onChange={(e) => onText(e.target.value)}
          aria-invalid={invalid || error !== undefined}
          aria-describedby={
            error === undefined ? `${uid}-note` : `${uid}-note ${uid}-err`
          }
          className="tabular-nums"
        />
      </div>
      <p id={`${uid}-note`} className={`px-1 ${sub}`}>
        {note}
      </p>
      {error !== undefined && (
        <p
          id={`${uid}-err`}
          role="alert"
          className="px-1 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function CostSheetBody({
  product,
  lines,
  onDone,
  onBusy,
}: {
  product: OwnerProduct;
  lines: CostLine[];
  onDone: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const alert = product.costAlert;
  const eceranUnitId = product.units[0]?.id;
  const [texts, setTexts] = useState<Record<string, string>>({});
  const invalidate = useInvalidateProduct(product.id);
  const finish = async () => {
    await invalidate();
    onDone();
  };
  const save = useUpdateOwnerProductPrices({ mutation: { onSuccess: finish } });
  const keep = useDismissOwnerCostAlert({ mutation: { onSuccess: finish } });

  const typedAny = lines.some((l) => (texts[l.key] ?? "").trim() !== "");
  const anyInvalid = lines.some((l) => {
    const t = (texts[l.key] ?? "").trim();
    return t !== "" && parseRupiah(t) === null;
  });
  // Harga yang diketik menang; tanpa ketikan dipakai saran. Tanpa harga, atau bila sama dengan
  // harga sekarang, baris tidak dikirim (tidak ada perubahan yang perlu dicatat).
  const payload = lines.flatMap((l): PriceLineInput[] => {
    const t = (texts[l.key] ?? "").trim();
    const price = t === "" ? l.suggested : parseRupiah(t);
    return price === null || price === l.price
      ? []
      : [{ unitId: l.unitId, tierMinQty: l.tierMinQty, price }];
  });
  const busy = save.isPending || keep.isPending;
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  const errors = save.isError
    ? splitErrors(save.error)
    : { fields: {} as FieldMessages, general: null };
  const keepError = keep.isError ? pesanError(keep.error) : null;
  const general = errors.general ?? keepError;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <SheetTitle className="text-[20px] font-bold">
            {`Harga modal ${costDirection(product)}`}
          </SheetTitle>
          <SheetDescription>{product.name}</SheetDescription>
        </div>
        <SheetClose
          aria-label="Tutup"
          disabled={busy}
          className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X aria-hidden="true" className="size-5" />
        </SheetClose>
      </div>
      {lines.map((line) => (
        <Block
          key={line.key}
          line={line}
          source={alert?.source ?? "pemilik"}
          changedAt={alert?.changedAt ?? 0}
          text={texts[line.key] ?? ""}
          onText={(value) => {
            save.reset();
            setTexts((prev) => ({ ...prev, [line.key]: value }));
          }}
          error={errors.fields[fieldOf(line, eceranUnitId)]}
        />
      ))}
      {general !== null && (
        <p role="alert" className="text-sm font-medium text-danger">
          {general}
        </p>
      )}
      <Button
        className="h-12 w-full text-[17px]"
        disabled={busy || anyInvalid || payload.length === 0}
        onClick={() =>
          save.mutate({ productId: product.id, data: { lines: payload } })
        }
      >
        {typedAny ? "Simpan harga" : "Pakai harga ini"}
      </Button>
      <Button
        variant="outline"
        className="h-12 w-full text-[17px]"
        disabled={busy}
        onClick={() => keep.mutate({ productId: product.id })}
      >
        Harga tetap
      </Button>
      <SheetClose asChild>
        <Button
          variant="ghost"
          className="h-12 w-full text-[17px]"
          disabled={busy}
        >
          Nanti saja
        </Button>
      </SheetClose>
    </>
  );
}

/**
 * Lembar `Harga modal naik|turun` dari Beranda (`?lembar=harga`). Terbuka hanya bila barang
 * punya peringatan modal; harga tidak pernah berubah kecuali lewat tombol pemilik.
 */
export function CostSheet({
  product,
  requested,
}: {
  product: OwnerProduct;
  requested: boolean;
}) {
  const navigate = useNavigate({ from: "/owner/barang/$productId" });
  const lines = costLines(product);
  const open = requested && lines.length > 0;
  const [busy, setBusy] = useState(false);
  const clearParam = () => void navigate({ search: {}, replace: true });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Selama menyimpan, Esc / klik luar / Tutup diabaikan agar hasilnya tidak hilang dari layar.
        if (!next && !busy) clearParam();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          // Dibuka dari URL, tanpa tombol pemicu: fokus ke judul halaman, bukan ke body.
          e.preventDefault();
          document.querySelector<HTMLElement>("main h1")?.focus();
        }}
        className="max-h-[92dvh] gap-4 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-[480px]"
      >
        <CostSheetBody
          product={product}
          lines={lines}
          onDone={clearParam}
          onBusy={setBusy}
        />
      </SheetContent>
    </Sheet>
  );
}
