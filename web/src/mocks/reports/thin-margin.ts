import type {
  StockReport,
  ThinMarginItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { unitCost } from "@/shared/lib/product-rules";
import { roundHalfUp } from "@/shared/lib/quantity";
import type { MockState } from "../db";
import { eceranOf } from "../products/views";
import { usableCost } from "../receipts/check";
import { byName } from "./report-utils";

/** Permil bertanda dibulatkan setengah ke atas (negatif = rugi). */
function signedPermille(profit: number, price: number): number {
  const permille = roundHalfUp(Math.abs(profit) * 1000, price);
  return profit < 0 ? -permille : permille;
}

/**
 * (K18, P10, koreksi mockup M3) Barang aktif ber-HPP dengan harga eceran > 0 yang margin
 * eceran-nya di bawah batas: `(price − unitCost) × 1000 < thinMarginPermille × price`. Urut
 * `marginPermille` naik (rugi dulu), lalu nama. Tidak masuk Perlu perhatian.
 */
export function thinMarginReport(
  state: Readonly<MockState>,
): StockReport["thinMargin"] {
  const thresholdPermille = state.reportRules.thinMarginPermille;
  const items: ThinMarginItem[] = [];
  for (const p of state.products) {
    if (p.status !== "aktif") continue;
    const eceran = eceranOf(p);
    const cost = unitCost(usableCost(p.cost), eceran.unitSize);
    const price = eceran.price;
    if (cost === null || price <= 0) continue;
    if ((price - cost) * 1000 >= thresholdPermille * price) continue;
    items.push({
      productId: p.id,
      productName: p.name,
      unitName: eceran.name,
      price,
      unitCost: cost,
      marginPermille: signedPermille(price - cost, price),
    });
  }
  items.sort(
    (a, b) =>
      a.marginPermille - b.marginPermille ||
      byName(a.productName, b.productName),
  );
  return { thresholdPermille, count: items.length, items };
}
