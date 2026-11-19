import type {
  Attention,
  CostChangeItem,
  ExceptionAttention,
  ExceptionKind,
  HourBucket,
  OpnameFlag,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate, formatIsoDayMonth } from "@/shared/lib/business-day";
import { formatRupiah, formatSignedRupiah } from "@/shared/lib/money";
import { roundHalfUp } from "@/shared/lib/quantity";
import { scopeLabel } from "@/shared/lib/stock-rules";

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
        | "/owner/lainnya/kedaluwarsa"
        | "/owner/lainnya/opname"
        | "/owner/kasbon";
    }
  | {
      to: "/owner/lainnya/opname/$sessionId";
      params: { sessionId: string };
    }
  | { to: "/owner/barang"; search: { menunggu: true } }
  | { to: "/owner/pengecualian/$kind"; params: { kind: ExceptionKind } }
  | {
      to: "/owner/pengecualian/$kind";
      params: { kind: ExceptionKind };
      search: { kasirId: string };
    }
  | { to: "/owner/lainnya/qris" }
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
  icon:
    | "stock"
    | "cost"
    | "stockout"
    | "cash"
    | "credit"
    | "debt"
    | "price"
    | "expiry"
    | "opname-flag"
    | "opname-held"
    | "exception-void"
    | "exception-repay"
    | "exception-limit"
    | "exception-cash-void"
    | "cash-expense"
    | "handover"
    | "long-shift"
    | "small-shortage"
    | "qris";
  link: AttentionLink;
  /** Butir kejadian: tombol `Tandai sudah ditinjau` di halaman Lihat semua (S8). */
  review?: { kind: ExceptionKind; kasirId: string | null; upTo: number };
  /** Butir QRIS: tombol `Cocokkan` membuka lembar pencocokan (S11). */
  reconcileQris?: true;
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

/** Butir kedaluwarsa tahap `kind`; kosong bila tak ada barangnya. */
function expiryItems(
  kind: "expired" | "soon",
  e: Attention["expiry"],
): AttentionItem[] {
  const expired = kind === "expired";
  if ((expired ? e.expiredCount : e.soonCount) === 0) return [];
  return [
    {
      key: `expiry-${kind}`,
      title: expired ? "Barang sudah kedaluwarsa" : "Barang segera kedaluwarsa",
      detail: expired
        ? `${e.expiredCount} barang`
        : `${e.soonCount} barang · ≤ ${e.soonDays} hari`,
      tone: expired ? "critical" : "warning",
      icon: "expiry",
      link: { to: "/owner/lainnya/kedaluwarsa" },
    },
  ];
}

function opnameFlagItem(f: OpnameFlag): AttentionItem {
  return {
    key: `opname-flag-${f.sessionId}`,
    title: "Selisih opname besar",
    detail: `${scopeLabel(f.scope)} · ${formatRupiah(f.totalValue)}`,
    tone: "critical",
    icon: "opname-flag",
    link: {
      to: "/owner/lainnya/opname/$sessionId",
      params: { sessionId: f.sessionId },
    },
  };
}

/** I2: hitungan tertahan yang diganti hitungan baru, sampai sesinya ditinjau. */
function opnameReplacedItems(count: number): AttentionItem[] {
  if (count === 0) return [];
  return [
    {
      key: "opname-replaced",
      title: "Opname tertahan diganti hitungan baru",
      detail: `${count} barang`,
      tone: "critical",
      icon: "opname-flag",
      link: { to: "/owner/lainnya/opname" },
    },
  ];
}

function opnameHeldItems(count: number): AttentionItem[] {
  if (count === 0) return [];
  return [
    {
      key: "opname-held",
      title: "Opname menunggu persetujuan",
      detail: `${count} barang`,
      tone: "warning",
      icon: "opname-held",
      link: { to: "/owner/lainnya/opname" },
    },
  ];
}

/** `5 Nov` / `2–5 Nov` / `28 Okt–5 Nov`; beda tahun memakai tahun di kedua ujung. */
export function exceptionRange(from: string, to: string): string {
  if (from === to) return formatIsoDayMonth(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${formatIsoDate(from)}–${formatIsoDate(to)}`;
  }
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${Number(from.slice(8))}–${formatIsoDayMonth(to)}`;
  }
  return `${formatIsoDayMonth(from)}–${formatIsoDayMonth(to)}`;
}

type ExceptionCopy = {
  icon: AttentionItem["icon"];
  title: (e: ExceptionAttention) => string;
  /** Bagian uang/keterangan sesudah rentang tanggal (teks final §12g). */
  amount: (e: ExceptionAttention) => string;
  tone?: (e: ExceptionAttention) => AttentionItem["tone"];
};

/** `−Rp12.000 · +Rp6.000`: bagian 0 tidak ditulis; kurang = `shortage`, lebih = sisanya dari `total`. */
function cashDifference(e: ExceptionAttention): string {
  const over = e.total - e.shortage;
  return [
    ...(e.shortage < 0 ? [formatSignedRupiah(e.shortage)] : []),
    ...(over > 0 ? [formatSignedRupiah(over)] : []),
  ].join(" · ");
}

const plain = (e: ExceptionAttention) => formatRupiah(e.total);

const EXCEPTION_COPY: Record<ExceptionKind, ExceptionCopy> = {
  batal_transaksi: {
    icon: "exception-void",
    title: (e) => `${e.count} transaksi dibatalkan kasir`,
    amount: plain,
  },
  batal_pelunasan: {
    icon: "exception-repay",
    title: (e) => `${e.count} pelunasan dibatalkan kasir`,
    amount: plain,
  },
  kasbon_lewat_limit: {
    icon: "exception-limit",
    title: (e) => `${e.count} kasbon lewat limit`,
    amount: (e) => `lewat ${formatRupiah(e.total)}`,
  },
  batal_kas_keluar: {
    icon: "exception-cash-void",
    title: (e) => `${e.count} kas keluar dibatalkan kasir`,
    amount: plain,
  },
  selisih_kas: {
    icon: "cash",
    title: (e) => `${e.count} selisih kas`,
    amount: cashDifference,
    tone: (e) => (e.shortage < 0 ? "critical" : "warning"),
  },
  kas_keluar: {
    icon: "cash-expense",
    title: (e) => `${e.count} kas keluar besar`,
    amount: plain,
  },
  serah_terima: {
    icon: "handover",
    title: (e) => `${e.count} modal awal berbeda`,
    amount: (e) => formatSignedRupiah(e.total),
  },
  shift_lama: {
    icon: "long-shift",
    title: (e) => `${e.count} shift kelamaan buka`,
    amount: (e) => `terlama ${Math.floor((e.longestMinutes ?? 0) / 60)} jam`,
  },
  selisih_kecil: {
    icon: "small-shortage",
    title: (e) => `Selisih kecil berulang · ${e.kasirName ?? ""}`,
    amount: (e) => `${e.count} shift · ${formatSignedRupiah(e.shortage)}`,
  },
};

/** Butir pengecualian kasir (ruling R9): menumpuk sejak terakhir ditinjau, dengan rentang tanggalnya. Selisih kecil satu butir per kasir. */
function exceptionItem(e: ExceptionAttention): AttentionItem {
  const copy = EXCEPTION_COPY[e.kind];
  const perKasir = e.kind === "selisih_kecil" && e.kasirId !== null;
  return {
    key: perKasir ? `exception-${e.kind}-${e.kasirId}` : `exception-${e.kind}`,
    title: copy.title(e),
    detail: `${exceptionRange(e.from, e.to)} · ${copy.amount(e)}`,
    tone: copy.tone?.(e) ?? "warning",
    icon: copy.icon,
    link:
      perKasir && e.kasirId !== null
        ? {
            to: "/owner/pengecualian/$kind",
            params: { kind: e.kind },
            search: { kasirId: e.kasirId },
          }
        : { to: "/owner/pengecualian/$kind", params: { kind: e.kind } },
    review: { kind: e.kind, kasirId: e.kasirId, upTo: e.latestAt },
  };
}

/** Butir `QRIS belum dicocokkan: {n} hari` (S7); hanya bila ada hari yang perlu dicocokkan. */
function qrisItems(q: Attention["qrisUnreconciled"]): AttentionItem[] {
  if (q === null) return [];
  return [
    {
      key: "qris-unreconciled",
      title: `QRIS belum dicocokkan: ${q.count} hari`,
      detail: exceptionRange(q.from, q.to),
      tone: "warning",
      icon: "qris",
      link: { to: "/owner/lainnya/qris" },
      reconcileQris: true,
    },
  ];
}

/** Urutan (mockup pengecualian disetujui): pengecualian kasir (batal transaksi, batal pelunasan, kasbon lewat limit), stok minus, kedaluwarsa, selisih opname besar, opname tertahan diganti, utang lewat, perubahan modal, barang baru menunggu harga, opname menunggu persetujuan, QRIS belum dicocokkan (M-2a), stok menipis, segera kedaluwarsa, utang segera, barang habis, kasbon > 30 hari. Selisih kas kini kejadian di `exceptions` (S6). */
export function attentionItems(a: Attention): AttentionItem[] {
  const items: AttentionItem[] = [...a.exceptions.map(exceptionItem)];
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
  items.push(...expiryItems("expired", a.expiry));
  items.push(...a.opnameFlags.map(opnameFlagItem));
  items.push(...opnameReplacedItems(a.opnameReplacedHeld));
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
  items.push(...opnameHeldItems(a.opnameHeldCount));
  items.push(...qrisItems(a.qrisUnreconciled));
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
  items.push(...expiryItems("soon", a.expiry));
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
