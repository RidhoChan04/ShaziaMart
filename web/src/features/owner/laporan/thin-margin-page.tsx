import { TrendingDown } from "lucide-react";
import { useGetOwnerStockReport } from "@/shared/api/gen/owner/owner";
import { formatPermille } from "@/shared/lib/margin";
import { formatRupiah } from "@/shared/lib/money";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import { ReportState, ToneBadge } from "./report-bits";

/** Untung tipis (K18): urutan naik dengan rugi di atas dari server; nada `Rugi` hanya dari tanda margin server (M3). */
export function ThinMarginPage() {
  const query = useGetOwnerStockReport();
  const thin = query.data?.thinMargin;
  return (
    <div className="grid gap-4">
      <SubPageHeader
        title="Untung tipis"
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <ReportState query={query}>
        {thin && (
          <>
            <p className="px-1 text-muted">
              {`Margin di bawah ${thin.thresholdPermille % 10 === 0 ? `${thin.thresholdPermille / 10}%` : formatPermille(thin.thresholdPermille)} dari harga eceran`}
            </p>
            {thin.items.length === 0 ? (
              <p className="rounded-lg bg-surface px-4 py-4 text-muted">
                Tidak ada barang dengan untung tipis
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg bg-surface">
                <RowList>
                  {thin.items.map((p) => (
                    <li
                      key={p.productId}
                      className="flex min-h-14 items-center gap-3 px-4 py-2"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="break-words">{p.productName}</span>
                        <span className="text-[13px] text-muted tabular-nums">
                          {`Modal ${formatRupiah(p.unitCost)} · harga ${formatRupiah(p.price)} per ${p.unitName}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <ToneBadge
                          tone={p.marginPermille < 0 ? "danger" : "warn"}
                          icon={TrendingDown}
                        >
                          {p.marginPermille < 0
                            ? `Rugi ${formatPermille(p.marginPermille)}`
                            : formatPermille(p.marginPermille)}
                        </ToneBadge>
                      </span>
                    </li>
                  ))}
                </RowList>
              </div>
            )}
          </>
        )}
      </ReportState>
    </div>
  );
}
