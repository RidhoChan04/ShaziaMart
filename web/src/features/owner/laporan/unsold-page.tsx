import { keepPreviousData } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useGetOwnerStockReport } from "@/shared/api/gen/owner/owner";
import {
  StockReportSort as SORT,
  type StockReportSort,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import { ReportState, StatCard, ToneBadge } from "./report-bits";

const SEGMENTS: ReadonlyArray<readonly [StockReportSort, string]> = [
  [SORT.modal, "Modal terbesar"],
  [SORT.lama, "Paling lama"],
];

/** Tidak terjual ≥ N hari (K17): urutan, jumlah, dan modal tertahan seluruhnya dari server. */
export function UnsoldPage() {
  const [sort, setSort] = useState<StockReportSort>(SORT.modal);
  const query = useGetOwnerStockReport(
    { sort },
    { query: { placeholderData: keepPreviousData } },
  );
  const unsold = query.data?.unsold;
  return (
    <div className="grid gap-4">
      <SubPageHeader
        title={`Tidak terjual ≥ ${unsold?.minDays ?? 30} hari`}
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <ReportState query={query}>
        {unsold && (
          <div
            className={cn(
              "grid gap-4",
              query.isPlaceholderData && "opacity-60",
            )}
          >
            <StatCard
              label="Modal tertahan"
              value={formatRupiah(unsold.heldValue)}
              note={`${unsold.count} barang`}
              extra={
                unsold.noCostCount > 0 && (
                  <div className="mt-2">
                    <ToneBadge tone="warn" icon={TriangleAlert}>
                      {`${unsold.noCostCount} barang belum ada HPP`}
                    </ToneBadge>
                  </div>
                )
              }
            />
            {unsold.items.length === 0 ? (
              <p className="rounded-lg bg-surface px-4 py-4 text-muted">
                Tidak ada barang yang lama tidak terjual
              </p>
            ) : (
              <>
                {/* biome-ignore lint/a11y/useSemanticElements: grup tombol bergaya segmen */}
                <div
                  role="group"
                  aria-label="Urutan"
                  className="flex gap-1 rounded-full bg-surface p-1"
                >
                  {SEGMENTS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={sort === value}
                      onClick={() => setSort(value)}
                      className={cn(
                        "min-h-11 flex-1 rounded-full px-2 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                        sort === value
                          ? "bg-primary text-primary-foreground"
                          : "text-text",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-lg bg-surface">
                  <RowList>
                    {unsold.items.map((p) => (
                      <li
                        key={p.productId}
                        className="flex min-h-14 items-center gap-3 px-4 py-2"
                      >
                        <span className="grid min-w-0 flex-1">
                          <span className="break-words">{p.productName}</span>
                          <span className="text-[13px] text-muted tabular-nums">
                            {p.lastSoldAt === null
                              ? `belum terjual · ${p.days} hari`
                              : `${p.days} hari · stok ${formatQty(p.stockQtyBase, p.unitSize, p.unitName)}`}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 tabular-nums",
                            p.heldValue === null
                              ? "text-[13px] text-muted"
                              : "font-semibold",
                          )}
                        >
                          {p.heldValue === null
                            ? "HPP belum ada"
                            : formatRupiah(p.heldValue)}
                        </span>
                      </li>
                    ))}
                  </RowList>
                </div>
              </>
            )}
          </div>
        )}
      </ReportState>
    </div>
  );
}
