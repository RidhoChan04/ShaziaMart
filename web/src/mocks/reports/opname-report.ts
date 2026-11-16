import type {
  OpnameCountRow,
  OpnameItemState,
  OpnameProductReport,
  OpnameReason,
  OpnameReport,
  OpnameReportItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { IsoRange } from "@/shared/lib/report-period";
import type { MockOpnameItem, MockOpnameSession, MockState } from "../db";
import { eceranOf } from "../products/views";
import { dutyBetween } from "./duty";
import { byName, nullsLast, windowOf } from "./report-utils";

/** (K19) Hitungan final; `ditahan`, `menunggu_alasan`, `diganti` tidak ikut, `stok_awal` patokan saja. */
const FINAL: ReadonlySet<OpnameItemState> = new Set<OpnameItemState>([
  "cocok",
  "disesuaikan",
  "disetujui",
  "dihitung_ulang",
]);

/** Satu hitungan final; `dihitung_ulang` memakai hasil hitung ulang pemilik. */
type FinalCount = {
  sessionId: string;
  productId: string;
  countedAt: number;
  counterName: string;
  diffQtyBase: number;
  value: number | null;
  reason: OpnameReason | null;
  state: OpnameItemState;
  snapshot: MockOpnameItem;
};

/** Hitungan final dari satu barang sesi; pencatat hitung ulang = pemilik yang menghitung ulang. */
function toFinalCount(
  session: MockOpnameSession,
  item: MockOpnameItem,
): FinalCount {
  const base = {
    sessionId: session.id,
    productId: item.productId,
    reason: item.reason,
    state: item.state,
    snapshot: item,
  };
  const recount = item.state === "dihitung_ulang" ? item.recount : null;
  if (recount === null) {
    return {
      ...base,
      countedAt: item.countedAt,
      counterName: session.createdByName,
      diffQtyBase: item.diffQtyBase,
      value: item.value,
    };
  }
  return {
    ...base,
    countedAt: recount.countedAt,
    counterName: item.resolvedByName ?? session.createdByName,
    diffQtyBase: recount.diffQtyBase,
    value: recount.value,
  };
}

/** Semua hitungan final, urut jam hitung naik. */
function finalCounts(state: Readonly<MockState>): FinalCount[] {
  return state.opnameSessions
    .flatMap((session) =>
      session.items
        .filter((item) => FINAL.has(item.state))
        .map((item) => toFinalCount(session, item)),
    )
    .sort((a, b) => a.countedAt - b.countedAt);
}

/** Hitungan final per barang dengan jam hitung di `range` (tanggal WIB), urut naik. */
function countsIn(
  state: Readonly<MockState>,
  range: IsoRange,
): Map<string, FinalCount[]> {
  const w = windowOf(range);
  const byProduct = new Map<string, FinalCount[]>();
  for (const c of finalCounts(state)) {
    if (c.countedAt < w.start || c.countedAt >= w.end) continue;
    byProduct.set(c.productId, [...(byProduct.get(c.productId) ?? []), c]);
  }
  return byProduct;
}

/** Σ nilai yang diketahui; 0 bila tidak ada hitungan; null bila semuanya tanpa HPP. */
function knownSum(counts: readonly FinalCount[]): number | null {
  if (counts.length === 0) return 0;
  const known = counts.flatMap((c) => (c.value === null ? [] : [c.value]));
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Kurang di ≥ 2 hitungan final berturut-turut (urut jam hitung). */
function repeatedShort(counts: readonly FinalCount[]): boolean {
  let run = 0;
  for (const c of counts) {
    run = c.diffQtyBase < 0 ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

/** Ringkasan satu barang; nama & satuan eceran barang sekarang, atau salinan hitungan terakhir. */
function itemOf(
  state: Readonly<MockState>,
  productId: string,
  counts: readonly FinalCount[],
): OpnameReportItem {
  const shorts = counts.filter((c) => c.diffQtyBase < 0);
  const overs = counts.filter((c) => c.diffQtyBase > 0);
  const product = state.products.find((p) => p.id === productId);
  const last = counts[counts.length - 1]?.snapshot;
  const eceran = product ? eceranOf(product) : null;
  return {
    productId,
    productName: product?.name ?? last?.productName ?? "",
    unitName: eceran?.name ?? last?.unitName ?? "",
    unitSize: eceran?.unitSize ?? last?.unitSize ?? 1,
    isCurah: product?.isCurah ?? last?.isCurah ?? false,
    countTotal: counts.length,
    shortCount: shorts.length,
    overCount: overs.length,
    repeated: repeatedShort(counts),
    shortQtyBase: shorts.reduce((a, c) => a - c.diffQtyBase, 0),
    overQtyBase: overs.reduce((a, c) => a + c.diffQtyBase, 0),
    lossValue: knownSum(shorts),
    gainValue: knownSum(overs),
  };
}

const byLossThenGain = (a: OpnameReportItem, b: OpnameReportItem): number =>
  nullsLast(a.lossValue, b.lossValue) ||
  (b.lossValue ?? 0) - (a.lossValue ?? 0) ||
  nullsLast(a.gainValue, b.gainValue) ||
  (b.gainValue ?? 0) - (a.gainValue ?? 0) ||
  byName(a.productName, b.productName);

/**
 * (K19, pengaman 4) Selisih opname per barang di `range` (sudah diperiksa & dijepit). Kartu
 * kotor: kurang dan lebih tidak saling mengurangi; hitungan tanpa HPP tidak dijumlah
 * (`unknownValueCount`). Hanya barang yang punya selisih, urut kerugian terbesar.
 */
export function opnameReport(
  state: Readonly<MockState>,
  range: IsoRange,
): OpnameReport {
  const items: OpnameReportItem[] = [];
  let unknownValueCount = 0;
  for (const [productId, counts] of countsIn(state, range)) {
    unknownValueCount += counts.filter(
      (c) => c.diffQtyBase !== 0 && c.value === null,
    ).length;
    const item = itemOf(state, productId, counts);
    if (item.shortCount + item.overCount > 0) items.push(item);
  }
  items.sort(byLossThenGain);
  const losing = items.filter((i) => i.shortCount > 0);
  const gaining = items.filter((i) => i.overCount > 0);
  return {
    range: { from: range.from, to: range.to },
    lossValue: losing.reduce((a, i) => a + (i.lossValue ?? 0), 0),
    lossCount: losing.length,
    gainValue: gaining.reduce((a, i) => a + (i.gainValue ?? 0), 0),
    gainCount: gaining.length,
    unknownValueCount,
    items,
  };
}

/** Jam hitungan final & stok awal barang ini (patokan awal jeda), urut naik. */
function anchorsOf(state: Readonly<MockState>, productId: string): number[] {
  const finals = finalCounts(state)
    .filter((c) => c.productId === productId)
    .map((c) => c.countedAt);
  const firsts = state.opnameSessions.flatMap((s) =>
    s.items
      .filter((i) => i.productId === productId && i.state === "stok_awal")
      .map((i) => i.countedAt),
  );
  return [...finals, ...firsts].sort((a, b) => a - b);
}

/**
 * Detail satu barang: hitungan final di `range` (terbaru dulu) dengan yang bertugas sejak
 * hitungan final/stok awal sebelumnya (boleh sebelum `range`), dan per nama berapa jeda hitungan
 * kurang orang itu bertugas. null bila barang tidak dikenal atau tanpa hitungan final di `range`.
 */
export function opnameProductReport(
  state: Readonly<MockState>,
  productId: string,
  range: IsoRange,
): OpnameProductReport | null {
  if (!state.products.some((p) => p.id === productId)) return null;
  const counts = countsIn(state, range).get(productId);
  if (!counts || counts.length === 0) return null;
  const anchors = anchorsOf(state, productId);
  const rows = [...counts].reverse().map((c): OpnameCountRow => {
    const previousCountedAt =
      anchors.filter((t) => t < c.countedAt).pop() ?? null;
    return {
      sessionId: c.sessionId,
      countedAt: c.countedAt,
      counterName: c.counterName,
      diffQtyBase: c.diffQtyBase,
      value: c.value,
      reason: c.reason,
      state: c.state,
      previousCountedAt,
      duty:
        previousCountedAt === null
          ? []
          : dutyBetween(
              state,
              productId,
              previousCountedAt,
              c.countedAt,
              c.sessionId,
            ),
    };
  });
  const intervals = new Map<string, number>();
  for (const row of rows) {
    if (row.diffQtyBase >= 0) continue;
    for (const d of row.duty) {
      intervals.set(d.name, (intervals.get(d.name) ?? 0) + 1);
    }
  }
  return {
    ...itemOf(state, productId, counts),
    range: { from: range.from, to: range.to },
    dutyOnShort: [...intervals]
      .map(([name, n]) => ({ name, intervals: n }))
      .sort((a, b) => byName(a.name, b.name)),
    counts: rows,
  };
}
