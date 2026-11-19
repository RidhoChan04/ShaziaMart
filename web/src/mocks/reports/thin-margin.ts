import type {
  StockReport,
  ThinMarginItem,
  ThinMarginPreview,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { marginPermille } from "@/shared/lib/margin";
import { unitCost } from "@/shared/lib/product-rules";
import type { MockState } from "../db";
import { eceranOf } from "../products/views";
import { usableCost } from "../receipts/check";
import { byName } from "./report-utils";

/** Barang yang dinilai: aktif, ber-HPP, harga eceran > 0 (permil tidak null). */
function* ratedItems(state: Readonly<MockState>): Generator<ThinMarginItem> {
  for (const p of state.products) {
    if (p.status !== "aktif") continue;
    const eceran = eceranOf(p);
    const cost = unitCost(usableCost(p.cost), eceran.unitSize);
    const price = eceran.price;
    // Harga eceran ≤ 0 → permil null → tidak ikut.
    const permille = cost === null ? null : marginPermille(price, price - cost);
    if (cost === null || permille === null) continue;
    yield {
      productId: p.id,
      productName: p.name,
      unitName: eceran.name,
      price,
      unitCost: cost,
      marginPermille: permille,
    };
  }
}

/** Untung tipis pada batas `thresholdPermille`: dibanding persis, bukan dari permil yang dibulatkan. */
const isThin = (item: ThinMarginItem, thresholdPermille: number): boolean =>
  (item.price - item.unitCost) * 1000 < thresholdPermille * item.price;

/**
 * (K18, P10, koreksi mockup M3) Barang aktif ber-HPP dengan harga eceran > 0 yang margin
 * eceran-nya di bawah batas: `(price − unitCost) × 1000 < thinMarginPermille × price` (dibanding
 * persis, bukan dari permil yang sudah dibulatkan). Urut `marginPermille` naik (rugi dulu), lalu
 * nama. Tidak masuk Perlu perhatian.
 */
export function thinMarginReport(
  state: Readonly<MockState>,
): StockReport["thinMargin"] {
  const thresholdPermille = state.reportRules.thinMarginPermille;
  const items = [...ratedItems(state)].filter((i) =>
    isThin(i, thresholdPermille),
  );
  items.sort(
    (a, b) =>
      a.marginPermille - b.marginPermille ||
      byName(a.productName, b.productName),
  );
  return { thresholdPermille, count: items.length, items };
}

/** (K13) Pratinjau Pengaturan: hitungan laporan di atas pada batas `permille`, tanpa menyimpan. */
export function thinMarginPreview(
  state: Readonly<MockState>,
  permille: number,
): ThinMarginPreview {
  let flagged = 0;
  let total = 0;
  for (const item of ratedItems(state)) {
    total += 1;
    if (isThin(item, permille)) flagged += 1;
  }
  return { flagged, total };
}
