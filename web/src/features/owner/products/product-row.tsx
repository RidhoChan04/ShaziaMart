import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { OwnerProductRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { productBadges, stockText } from "./product-model";
import { StatusBadge } from "./status-badge";

/** Satu baris daftar; baris di luar layar tidak dilukis (`content-visibility`). */
export function ProductRow({ row }: { row: OwnerProductRow }) {
  const stock = stockText(row);
  return (
    <li className="border-b border-border last:border-b-0 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
      <Link
        to="/owner/barang/$productId"
        params={{ productId: row.id }}
        className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-primary-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
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
            <p className="shrink-0 text-[15px] font-semibold whitespace-nowrap tabular-nums">
              {formatRupiah(row.price)}/{row.unitName}
            </p>
          </div>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
}
