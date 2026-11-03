import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError } from "@/shared/api/fetcher";
import {
  getGetOwnerProductQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerCategoriesQueryKey,
  getListOwnerProductsQueryKey,
  useCreateOwnerProduct,
  useGetOwnerProduct,
  useListOwnerCategories,
  useUpdateOwnerProduct,
} from "@/shared/api/gen/owner/owner";
import type {
  OwnerProduct,
  ProductField,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  productValidationProblemSchema,
  readProblem,
} from "@/shared/api/problem";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { activeBigUnit, validateDraft } from "@/shared/lib/product-rules";
import { Button } from "@/shared/ui/button";
import { pillClass } from "../../common/sub-page-header";
import { ProductNotFound } from "../detail/product-detail-page";
import { ScanButton } from "../scan/scan-button";
import { FormSection, fieldId, SectionNote, TextField } from "./form-section";
import {
  clearBigValues,
  draftFromForm,
  emptyFormValues,
  type FormValues,
  firstErrorByField,
  formValuesFromProduct,
  hintsFromDraft,
  inputFromDraft,
} from "./form-state";
import { MoneyField } from "./money-field";

const SMALL_UNITS = [
  "pcs",
  "bungkus",
  "buah",
  "botol",
  "kaleng",
  "sachet",
  "butir",
  "kg",
  "ons",
  "liter",
];
const BIG_UNITS = [
  "dus",
  "slop",
  "renceng",
  "pak",
  "lusin",
  "karton",
  "bal",
  "karung",
  "krat",
];
const LOCKED_SOLD = "Tidak bisa diubah — barang sudah terjual";
const LOCKED_STOCK = "Tidak bisa diubah — barang sudah punya stok";

/** Urutan isian di layar; fokus pergi ke yang paling atas dari yang salah. */
const FIELD_ORDER = Object.keys(emptyFormValues()) as ProductField[];

type Errors = Partial<Record<ProductField, string>>;

export type BarcodeTarget = "barcode" | "bigBarcode";
/** Slot untuk tombol kamera di samping isian barcode; `apply` mengisi barcode hasil scan. */
export type ScanSlot = (
  target: BarcodeTarget,
  apply: (code: string) => void,
  manual: () => void,
) => ReactNode;

const NEXT_FIELDS: Record<BarcodeTarget, readonly ProductField[]> = {
  barcode: ["cost", "price"],
  bigBarcode: ["bigCost", "bigPrice"],
};

/** Tombol kamera bawaan: purpose mengikuti isian barcode. */
const cameraSlot: ScanSlot = (target, apply, manual) => (
  <ScanButton
    purpose={target === "barcode" ? "eceran" : "besar"}
    onDetected={apply}
    onManual={manual}
  />
);

/** Fokus setelah dialog kamera tertutup (Radix sempat memindahkan fokus). */
function focusLater(ids: readonly ProductField[]) {
  setTimeout(() => {
    for (const f of ids) {
      const el = document.getElementById(fieldId(f));
      if (el) {
        el.focus();
        return;
      }
    }
  }, 0);
}

function Datalist({ id, options }: { id: string; options: readonly string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  );
}

const BIG_FIELDS: readonly ProductField[] = [
  "bigName",
  "bigSize",
  "bigBarcode",
  "bigCost",
  "bigPrice",
];

function withoutErrors(e: Errors, fields: readonly ProductField[]): Errors {
  return Object.fromEntries(
    Object.entries(e).filter(([k]) => !fields.includes(k as ProductField)),
  );
}

/**
 * Kunci dari barang tersimpan: satuan dasar (terjual, atau stok ≠ 0 yang akan berubah arti)
 * dan isi satuan besar yang terjual. Nilai = keterangan di bawah isian; null = tidak terkunci.
 */
function lockState(product: OwnerProduct | null) {
  const bigUnit = product ? activeBigUnit(product) : null;
  const sold =
    product !== null && (product.hasSales || product.units[0]?.sold === true);
  const sellUnitLock = sold
    ? LOCKED_SOLD
    : product !== null && product.stock !== 0
      ? LOCKED_STOCK
      : null;
  return {
    bigUnit,
    sellUnitLock,
    bigSizeLock: bigUnit?.sold === true ? LOCKED_SOLD : null,
  };
}

/** Isian yang tidak bisa difokus: terkunci, atau modal eceran yang dihitung dari satuan besar (tidak tampil). */
function unreachableFields(
  sellUnitLock: string | null,
  bigSizeLock: string | null,
  costComputed: boolean,
): ReadonlySet<ProductField> {
  const out = new Set<ProductField>();
  if (sellUnitLock) out.add("sellUnit");
  if (bigSizeLock) out.add("bigSize");
  if (costComputed) out.add("cost");
  return out;
}

function FormBody({
  product,
  renderScan,
}: {
  product: OwnerProduct | null;
  renderScan: ScanSlot | undefined;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const categories = useListOwnerCategories();
  const create = useCreateOwnerProduct();
  const update = useUpdateOwnerProduct();
  const [values, setValues] = useState<FormValues>(() =>
    product ? formValuesFromProduct(product) : emptyFormValues(),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<{
    field: ProductField;
    n: number;
  }>();
  const submitting = useRef(false);

  useEffect(() => {
    if (focusReq) document.getElementById(fieldId(focusReq.field))?.focus();
  }, [focusReq]);

  const pending = create.isPending || update.isPending;
  const set = (field: ProductField) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => withoutErrors(e, [field]));
  };
  const text = (field: ProductField) => ({
    field,
    value: values[field],
    onChange: set(field),
    error: errors[field],
  });

  const { sellUnitLock, bigSizeLock, bigUnit } = lockState(product);

  const { draft } = draftFromForm(values);
  const hints = hintsFromDraft(draft);
  const unit = values.sellUnit.trim();

  const unreachable = unreachableFields(
    sellUnitLock,
    bigSizeLock,
    hints.computedCostFrom !== null,
  );

  const showErrors = (next: Errors) => {
    setErrors(next);
    const hidden = FIELD_ORDER.filter(
      (f) => next[f] !== undefined && unreachable.has(f),
    ).map((f) => next[f]);
    if (hidden.length > 0) setFailure(hidden.join(" · "));
    const first = FIELD_ORDER.find(
      (f) => next[f] !== undefined && !unreachable.has(f),
    );
    if (first) setFocusReq((r) => ({ field: first, n: (r?.n ?? 0) + 1 }));
  };

  const finish = (saved: OwnerProduct) => {
    client.setQueryData(getGetOwnerProductQueryKey(saved.id), saved);
    void client.invalidateQueries({ queryKey: getListOwnerProductsQueryKey() });
    void client.invalidateQueries({
      queryKey: getListOwnerCategoriesQueryKey(),
    });
    void client.invalidateQueries({
      queryKey: getGetOwnerTodaySummaryQueryKey(),
    });
    void navigate({
      to: "/owner/barang/$productId",
      params: { productId: saved.id },
      replace: true,
    });
  };

  const fail = (error: unknown) => {
    submitting.current = false;
    const problem = readProblem(error, productValidationProblemSchema);
    if (problem && problem.errors.length > 0) {
      showErrors(firstErrorByField(problem.errors));
      return;
    }
    setFailure(
      error instanceof ApiError ? pesanError(error) : pesanError(null),
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Dua klik cepat tiba sebelum status pending tampil di layar.
    if (submitting.current) return;
    setFailure(null);
    const { draft: d, problems } = draftFromForm(values);
    const all = [...problems, ...validateDraft(d)];
    if (all.length > 0) {
      showErrors(firstErrorByField(all));
      return;
    }
    submitting.current = true;
    const data = inputFromDraft(d, bigUnit?.id ?? null);
    const callbacks = { onSuccess: finish, onError: fail };
    if (product) update.mutate({ productId: product.id, data }, callbacks);
    else create.mutate({ data }, callbacks);
  };

  const clearBig = () => {
    setValues((v) => clearBigValues(v, hints.computedCostFrom?.cost ?? null));
    setErrors((e) => withoutErrors(e, BIG_FIELDS));
  };

  const scan = (target: BarcodeTarget) =>
    renderScan?.(
      target,
      (code) => {
        set(target)(code);
        focusLater(NEXT_FIELDS[target]);
      },
      () => focusLater([target]),
    );

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:max-w-2xl lg:pb-10"
    >
      <header className="pt-3 lg:pt-4">
        {product ? (
          <Link
            to="/owner/barang/$productId"
            params={{ productId: product.id }}
            className={pillClass}
          >
            Batal
          </Link>
        ) : (
          <Link to="/owner/barang" className={pillClass}>
            Batal
          </Link>
        )}
        <h1 className="mt-3 text-[28px] leading-tight font-bold tracking-[-0.025em]">
          {product ? "Ubah barang" : "Barang baru"}
        </h1>
      </header>

      <FormSection
        title="Barang"
        footer={
          <SectionNote>
            Satuan terkecil yang dijual kasir. Barang timbang: pilih kg, ons,
            atau liter.
          </SectionNote>
        }
      >
        <TextField {...text("name")} label="Nama" />
        <TextField {...text("category")} label="Kategori" list="pf-kategori" />
        <TextField
          {...text("sellUnit")}
          label="Dijual per"
          list="pf-satuan-kecil"
          disabled={sellUnitLock !== null}
          note={sellUnitLock ?? undefined}
        />
        <Datalist id="pf-kategori" options={categories.data ?? []} />
        <Datalist id="pf-satuan-kecil" options={SMALL_UNITS} />
      </FormSection>

      <FormSection
        title="Eceran"
        footer={hints.eceran && <SectionNote live>{hints.eceran}</SectionNote>}
      >
        <TextField
          {...text("barcode")}
          label="Barcode"
          inputMode="numeric"
          trailing={scan("barcode")}
        />
        {hints.computedCostFrom ? (
          <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 text-[17px]">
            <span className="shrink-0 whitespace-nowrap">Harga modal</span>
            <span className="text-right text-muted tabular-nums">
              Dihitung dari modal {hints.computedCostFrom.bigName}:{" "}
              {formatRupiah(hints.computedCostFrom.cost)}
            </span>
          </div>
        ) : (
          <MoneyField {...text("cost")} label="Harga modal" />
        )}
        <MoneyField {...text("price")} label="Harga jual" />
      </FormSection>

      <FormSection
        title="Grosir"
        optional
        footer={hints.grosir && <SectionNote live>{hints.grosir}</SectionNote>}
      >
        <TextField
          {...text("tierMinQty")}
          label="Beli minimal"
          inputMode="numeric"
          suffix={unit}
        />
        <MoneyField
          {...text("tierPrice")}
          label={`Harga per ${unit || "satuan"}`}
        />
      </FormSection>

      <FormSection
        title="Satuan besar"
        optional
        footer={
          <>
            {hints.besar && <SectionNote live>{hints.besar}</SectionNote>}
            <div className="mt-2 px-1">
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                onClick={clearBig}
              >
                Hapus satuan besar
              </Button>
            </div>
          </>
        }
      >
        <TextField {...text("bigName")} label="Satuan" list="pf-satuan-besar" />
        <TextField
          {...text("bigSize")}
          label="Isi"
          inputMode="numeric"
          suffix={unit}
          disabled={bigSizeLock !== null}
          note={bigSizeLock ?? undefined}
        />
        <TextField
          {...text("bigBarcode")}
          label="Barcode"
          inputMode="numeric"
          trailing={scan("bigBarcode")}
        />
        <MoneyField {...text("bigCost")} label="Harga modal" />
        <MoneyField {...text("bigPrice")} label="Harga jual" />
        <Datalist id="pf-satuan-besar" options={BIG_UNITS} />
      </FormSection>

      <FormSection
        title="Batas stok menipis"
        footer={
          <SectionNote>
            Barang muncul di "Perlu perhatian" di Beranda.
          </SectionNote>
        }
      >
        <TextField
          {...text("minStock")}
          label="Ingatkan bila stok di bawah"
          inputMode="decimal"
          suffix={unit}
        />
      </FormSection>

      <div className="sticky bottom-0 z-10 grid gap-2 bg-linear-to-t from-bg from-75% to-transparent pt-6 pb-[calc(84px+env(safe-area-inset-bottom))] lg:static lg:bg-none lg:pt-0 lg:pb-0">
        {failure && (
          <p role="alert" className="text-sm font-medium text-danger">
            {failure}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

function EditLoader({
  productId,
  renderScan,
}: {
  productId: string;
  renderScan: ScanSlot | undefined;
}) {
  const query = useGetOwnerProduct(productId);
  const product = query.data;
  if (!product) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <ProductNotFound />;
    }
    if (query.isError) {
      return (
        <div className="grid justify-items-start gap-3 pt-6">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      );
    }
    return (
      <p role="status" className="pt-6 text-muted">
        Memuat…
      </p>
    );
  }
  return (
    <FormBody key={product.id} product={product} renderScan={renderScan} />
  );
}

/** Tambah barang (tanpa `productId` di URL) atau ubah barang. */
export function ProductFormPage({
  renderScan = cameraSlot,
}: {
  renderScan?: ScanSlot;
}) {
  const { productId } = useParams({ strict: false });
  if (productId === undefined) {
    return <FormBody product={null} renderScan={renderScan} />;
  }
  return <EditLoader productId={productId} renderScan={renderScan} />;
}
