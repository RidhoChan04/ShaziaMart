import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { unitCost } from "@/shared/lib/product-rules";
import { TextField } from "./form-section";
import { MoneyField } from "./money-field";

const FOLLOWS_RECEIPTS = "Mengikuti barang masuk";

/** Modal sekarang per satuan eceran dan per satuan besar untuk barang yang punya barang masuk; null bila modalnya diketik pemilik. */
export function receiptCostTexts(
  product: OwnerProduct | null,
  bigUnit: { unitSize: number } | null,
): { eceran: string; big: string } | null {
  if (product?.hasReceipts !== true) return null;
  const text = (size: number | null): string => {
    const n = size === null ? null : unitCost(product.cost, size);
    return n === null ? "" : formatRupiah(n);
  };
  return {
    eceran: text(product.units[0]?.unitSize ?? 1),
    big: text(bigUnit?.unitSize ?? null),
  };
}

type MoneyProps = Omit<Parameters<typeof MoneyField>[0], "label">;

/**
 * Baris `Harga modal`: hanya-baca bila modal mengikuti barang masuk (`locked` = nilainya), teks bila
 * dihitung dari modal satuan besar, selain itu isian rupiah.
 */
export function CostRow({
  field,
  locked,
  computedFrom = null,
  money,
}: {
  field: "cost" | "bigCost";
  locked: string | undefined;
  computedFrom?: { bigName: string; cost: number } | null;
  money: MoneyProps;
}) {
  if (locked !== undefined) {
    return (
      <TextField
        field={field}
        label="Harga modal"
        value={locked}
        onChange={() => undefined}
        disabled
        note={FOLLOWS_RECEIPTS}
      />
    );
  }
  if (computedFrom) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5 text-[17px]">
        <span className="shrink-0 whitespace-nowrap">Harga modal</span>
        <span className="text-right text-muted tabular-nums">
          Dihitung dari modal {computedFrom.bigName}:{" "}
          {formatRupiah(computedFrom.cost)}
        </span>
      </div>
    );
  }
  return <MoneyField {...money} label="Harga modal" />;
}
