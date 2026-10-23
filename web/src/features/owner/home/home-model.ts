import type {
  Attention,
  HourBucket,
} from "../../../shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "../../../shared/lib/money";
import { roundHalfUp } from "../../../shared/lib/quantity";

type Trend = "up" | "down" | "flat" | "none";

export function comparisonText(
  revenue: number,
  lastWeekRevenue: number,
  weekday: string,
): { text: string; trend: Trend } {
  if (lastWeekRevenue === 0)
    return { text: `Belum ada data ${weekday} lalu`, trend: "none" };
  if (revenue === lastWeekRevenue)
    return { text: `Sama dengan ${weekday} lalu`, trend: "flat" };
  const percent = roundHalfUp(
    Math.abs(revenue - lastWeekRevenue) * 100,
    lastWeekRevenue,
  );
  const up = revenue > lastWeekRevenue;
  return {
    text: `${up ? "▲" : "▼"} ${percent}% dari ${weekday} lalu`,
    trend: up ? "up" : "down",
  };
}

const DEFAULT_WINDOW = { from: 6, to: 21 };
const EMPTY_WINDOW_HOURS = 6;

/** Jam yang ditampilkan grafik: dari omzet pertama sampai terakhir di salah satu seri. */
export function hourWindow(
  hourly: HourBucket[],
  nowHour: number,
): { from: number; to: number } {
  if (hourly.length === 0) return DEFAULT_WINDOW;
  const active = hourly
    .filter((b) => b.revenue > 0 || b.lastWeekRevenue > 0)
    .map((b) => b.hour);
  if (active.length > 0)
    return { from: Math.min(...active), to: Math.max(...active) };
  // Tanpa omzet: jendela tetap muat di 0-23 walau jam sekarang dekat tengah malam.
  const from = Math.min(
    Math.max(nowHour - EMPTY_WINDOW_HOURS / 2, 0),
    24 - EMPTY_WINDOW_HOURS,
  );
  return { from, to: from + EMPTY_WINDOW_HOURS - 1 };
}

type AttentionItem = {
  key: string;
  text: string;
  tone: "warning" | "critical";
  to: string;
};

export function attentionItems(a: Attention): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (a.negativeStockCount > 0) {
    items.push({
      key: "negative-stock",
      text: `${a.negativeStockCount} barang stok minus`,
      tone: "critical",
      to: "/owner/barang",
    });
  }
  if (a.lowStockCount > 0) {
    items.push({
      key: "low-stock",
      text: `${a.lowStockCount} barang stok menipis`,
      tone: "warning",
      to: "/owner/barang",
    });
  }
  for (const c of a.cashDifferences) {
    const signed =
      c.difference > 0
        ? `+${formatRupiah(c.difference)}`
        : formatRupiah(c.difference);
    items.push({
      key: `cash-${c.shiftId}`,
      text: `Selisih kas shift ${c.kasirName} ${signed}`,
      tone: c.difference < 0 ? "critical" : "warning",
      to: "/owner/lainnya",
    });
  }
  if (a.overdueCredit.count > 0) {
    items.push({
      key: "overdue-credit",
      text: `${a.overdueCredit.count} kasbon > 30 hari · ${formatRupiah(a.overdueCredit.total)}`,
      tone: "warning",
      to: "/owner/kasbon",
    });
  }
  return items;
}
