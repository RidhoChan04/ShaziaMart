import type { OwnerTodaySummary } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";

export function KpiTiles({ summary }: { summary: OwnerTodaySummary }) {
  const tiles = [
    ["Laba kotor", formatRupiah(summary.grossProfit)],
    ["Transaksi", String(summary.salesCount)],
    ["Kasbon baru", formatRupiah(summary.newCredit)],
    ["Rata-rata / struk", formatRupiah(summary.avgTicket)],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-2 lg:gap-3">
      {tiles.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg bg-surface px-3.5 py-3">
          <dt className="truncate text-[13px] font-semibold text-muted">
            {label}
          </dt>
          <dd className="num truncate text-[21px] font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
