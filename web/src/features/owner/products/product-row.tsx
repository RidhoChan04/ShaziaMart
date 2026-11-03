import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { memo } from "react";
import type { OwnerProductRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { FitAmount } from "../common/fit-amount";
import { productBadges, stockText } from "./product-model";
import { StatusBadge } from "./status-badge";

/** Kolom harga = bagian dari lebar kolom teks baris (lebar daftar dikurangi padding, jarak, dan chevron). */
const PRICE_SHARE = 0.38;
const ROW_CHROME_PX = 60;

export function priceColumnWidth(listWidth: number): number {
  return Math.max(0, Math.floor((listWidth - ROW_CHROME_PX) * PRICE_SHARE));
}

/**
 * Satu baris daftar; baris di luar layar tidak dilukis (`content-visibility`). `memo`: mengetik
 * di kolom cari atau mengubah satu barang tidak merender ulang ratusan baris yang sama.
 */
export const ProductRow = memo(function ProductRow({
  row,
  priceWidth,
}: {
  row: OwnerProductRow;
  /** Lebar kolom harga (px) dari daftar; satu pengukuran untuk semua baris, bukan satu observer per baris. */
  priceWidth: number;
}) {
  const stock = stockText(row);
  return (
    <li className="border-b border-border last:border-b-0 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
      <Link
        to="/owner/barang/$productId"
        params={{ productId: row.id }}
        className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug font-semibold">{row.name}</p>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted tabular-nums">
              {stock && <span>{stock}</span>}
              {productBadges(row).map((b) => (
                <StatusBadge key={b.key} badge={b} />
              ))}
            </p>
            {/* Lebar kolom ditetapkan dari luar: ukuran huruf tidak boleh bergantung pada isinya sendiri. */}
            <div
              style={{ width: priceWidth > 0 ? priceWidth : undefined }}
              className={cn(
                "shrink-0 text-right font-semibold tabular-nums",
                priceWidth > 0 ? "" : "w-[38%]",
              )}
            >
              <FitAmount
                text={`${formatRupiah(row.price)}/${row.unitName}`}
                max={15}
                min={12}
                width={priceWidth}
              />
            </div>
          </div>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
});
