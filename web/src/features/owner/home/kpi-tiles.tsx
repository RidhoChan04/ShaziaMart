import type { OwnerTodaySummary } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";

export function KpiTiles({ summary }: { summary: OwnerTodaySummary }) {
  const tiles = [
    ["LABA KOTOR", formatRupiah(summary.grossProfit)],
    ["TRANSAKSI", String(summary.salesCount)],
    ["KASBON BARU", formatRupiah(summary.newCredit)],
    ["RATA-RATA / STRUK", formatRupiah(summary.avgTicket)],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-2 lg:gap-3">
      {tiles.map(([label, value]) => (
        <div
          key={label}
          className="min-w-0 rounded-lg border border-border bg-surface p-3"
        >
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className="num truncate text-base font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
