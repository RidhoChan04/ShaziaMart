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
const MIN_WINDOW_HOURS = 6;
const LAST_HOUR = 23;

/** Jam yang ditampilkan grafik: rentang jam beromzet (atau jam sekarang bila tak ada), minimal 6 jam. */
export function hourWindow(
  hourly: HourBucket[],
  nowHour: number,
): { from: number; to: number } {
  if (hourly.length === 0) return DEFAULT_WINDOW;
  const active = hourly
    .filter((b) => b.revenue > 0 || b.lastWeekRevenue > 0)
    .map((b) => b.hour);
  const first = active.length > 0 ? Math.min(...active) : nowHour;
  const last = active.length > 0 ? Math.max(...active) : nowHour;
  const extra = Math.max(MIN_WINDOW_HOURS - (last - first + 1), 0);
  const from = first - Math.ceil(extra / 2);
  const to = last + Math.floor(extra / 2);
  // Geser (bukan potong) agar tetap muat di 0-23 dengan lebar sama.
  const shift = Math.max(-from, 0) - Math.max(to - LAST_HOUR, 0);
  return { from: from + shift, to: to + shift };
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
    if (c.difference === 0) continue;
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
