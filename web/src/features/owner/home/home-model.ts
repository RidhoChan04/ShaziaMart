import type {
  Attention,
  CostChangeItem,
  HourBucket,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { roundHalfUp } from "@/shared/lib/quantity";

export function comparisonText(
  revenue: number,
  lastWeekRevenue: number,
  weekday: string,
): string {
  if (lastWeekRevenue === 0) return `Belum ada data ${weekday} lalu`;
  const percent = roundHalfUp(
    Math.abs(revenue - lastWeekRevenue) * 100,
    lastWeekRevenue,
  );
  // Selisih yang dibulatkan ke 0% dibaca "sama", bukan "▲ 0%".
  if (percent === 0) return `Sama dengan ${weekday} lalu`;
  const up = revenue > lastWeekRevenue;
  return `${up ? "▲" : "▼"} ${percent}% dari ${weekday} lalu`;
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

export type AttentionLink =
  | {
      to:
        | "/owner/barang"
        | "/owner/lainnya"
        | "/owner/lainnya/utang"
        | "/owner/kasbon";
    }
  | { to: "/owner/barang"; search: { menunggu: true } }
  | {
      to: "/owner/barang/$productId";
      params: { productId: string };
      search: { lembar: "harga" | "habis" };
    };

export type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  tone: "warning" | "critical";
  icon: "stock" | "cost" | "stockout" | "cash" | "credit" | "debt" | "price";
  link: AttentionLink;
};

/** Butir `Harga modal {nama} naik|turun {Rp}`; selisih eceran di bawah Rp1 tidak pernah ditulis "Rp0". */
function costItem(c: CostChangeItem): AttentionItem {
  const delta = c.newCost - c.oldCost;
  const verb =
    delta === 0
      ? "berubah"
      : `${delta > 0 ? "naik" : "turun"} ${formatRupiah(Math.abs(delta))}`;
  const profit = c.price - c.newCost;
  return {
    key: `cost-${c.productId}`,
    title: `Harga modal ${c.productName} ${verb}`,
    detail:
      profit < 0
        ? `Rugi ${formatRupiah(-profit)}`
        : `Untung jadi ${formatRupiah(profit)}`,
    tone: "warning",
    icon: "cost",
    link: {
      to: "/owner/barang/$productId",
      params: { productId: c.productId },
      search: { lembar: "harga" },
    },
  };
}

function debtItem(
  kind: "overdue" | "soon",
  count: number,
  total: number,
): AttentionItem {
  return {
    key: `debt-${kind}`,
    title: `Utang supplier ${kind === "overdue" ? "lewat" : "segera"} jatuh tempo`,
    detail: `${count} nota · ${formatRupiah(total)}`,
    tone: kind === "overdue" ? "critical" : "warning",
    icon: "debt",
    link: { to: "/owner/lainnya/utang" },
  };
}

/** Urutan: stok minus, utang lewat, perubahan modal, barang baru menunggu harga, stok menipis, utang segera, barang habis, selisih kas, kasbon > 30 hari. */
export function attentionItems(a: Attention): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (a.negativeStockCount > 0) {
    items.push({
      key: "negative-stock",
      title: "Stok minus",
      detail: `${a.negativeStockCount} barang`,
      tone: "critical",
      icon: "stock",
      link: { to: "/owner/barang" },
    });
  }
  const debts = a.supplierDebts;
  if (debts.overdueCount > 0) {
    items.push(debtItem("overdue", debts.overdueCount, debts.overdueTotal));
  }
  items.push(...a.costChanges.map(costItem));
  if (a.awaitingPriceCount > 0) {
    items.push({
      key: "awaiting-price",
      title: `${a.awaitingPriceCount} barang baru dari barang masuk`,
      detail: "Lengkapi harga jual",
      tone: "warning",
      icon: "price",
      link: { to: "/owner/barang", search: { menunggu: true } },
    });
  }
  if (a.lowStockCount > 0) {
    items.push({
      key: "low-stock",
      title: "Stok menipis",
      detail: `${a.lowStockCount} barang`,
      tone: "warning",
      icon: "stock",
      link: { to: "/owner/barang" },
    });
  }
  if (debts.dueSoonCount > 0) {
    items.push(debtItem("soon", debts.dueSoonCount, debts.dueSoonTotal));
  }
  for (const s of a.stockOuts) {
    items.push({
      key: `stockout-${s.productId}`,
      title: `${s.productName} habis`,
      detail: "Tidak diambil lagi",
      tone: "warning",
      icon: "stockout",
      link: {
        to: "/owner/barang/$productId",
        params: { productId: s.productId },
        search: { lembar: "habis" },
      },
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
      title: `Selisih kas ${signed}`,
      detail: `Shift ${c.kasirName}`,
      tone: c.difference < 0 ? "critical" : "warning",
      icon: "cash",
      link: { to: "/owner/lainnya" },
    });
  }
  if (a.overdueCredit.count > 0) {
    items.push({
      key: "overdue-credit",
      title: "Kasbon > 30 hari",
      detail: `${a.overdueCredit.count} pelanggan · ${formatRupiah(a.overdueCredit.total)}`,
      tone: "warning",
      icon: "credit",
      link: { to: "/owner/kasbon" },
    });
  }
  return items;
}
