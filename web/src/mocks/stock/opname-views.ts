import type {
  OpnameReceiptOption,
  OpnameScope,
  StaffOpnameCategories,
  StaffOpnameCategory,
  StaffOpnameItem,
  StaffOpnameRow,
  StaffOpnameSession,
  StaffProduct,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { sameScope, scopeLabel } from "@/shared/lib/stock-rules";
import type {
  MockOpnameItem,
  MockOpnameSession,
  MockProduct,
  MockReceipt,
  MockState,
} from "../db";
import { toStaffProduct } from "../products/views";
import { supplierNameOf } from "../receipts/views";

const RECEIPT_OPTIONS_MAX = 5;

const scopeOf = (p: MockProduct): OpnameScope =>
  p.category === null
    ? { kind: "tanpa_kategori", category: null }
    : { kind: "kategori", category: p.category };

/** K14: barang di lingkup ini; `semua` = semua barang. */
const inScope = (p: MockProduct, scope: OpnameScope): boolean =>
  scope.kind === "semua" || sameScope(scopeOf(p), scope);

const countable = (state: Readonly<MockState>): MockProduct[] =>
  state.products.filter((p) => p.status !== "nonaktif");

/** `submittedAt` sesi terakhir (siapa pun) dengan lingkup ini atau `semua`. */
function lastCountedAt(
  state: Readonly<MockState>,
  scope: OpnameScope,
): number | null {
  let last: number | null = null;
  for (const s of state.opnameSessions) {
    if (s.scope.kind !== "semua" && !sameScope(s.scope, scope)) continue;
    if (last === null || s.submittedAt > last) last = s.submittedAt;
  }
  return last;
}

/** K14: lingkup berisi barang; belum pernah dihitung dulu, lalu paling lama dihitung. */
export function opnameCategories(
  state: Readonly<MockState>,
): StaffOpnameCategories {
  const products = countable(state);
  const groups = new Map<string, { scope: OpnameScope; count: number }>();
  for (const p of products) {
    const scope = scopeOf(p);
    const key = `${scope.kind}:${scope.category ?? ""}`;
    const group = groups.get(key) ?? { scope, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const categories: StaffOpnameCategory[] = [...groups.values()]
    .map(({ scope, count }) => ({
      scope,
      productCount: count,
      lastCountedAt: lastCountedAt(state, scope),
    }))
    .sort(
      (a, b) =>
        (a.lastCountedAt ?? -Infinity) - (b.lastCountedAt ?? -Infinity) ||
        scopeLabel(a.scope).localeCompare(scopeLabel(b.scope), "id"),
    );
  return {
    categories,
    allCount: products.length,
    suggested: categories[0]?.scope ?? null,
  };
}

/** K15: daftar hitung tanpa stok, urut nama. */
export function opnameProducts(
  state: Readonly<MockState>,
  scope: OpnameScope,
): StaffProduct[] {
  return countable(state)
    .filter((p) => inScope(p, scope))
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
    .map(toStaffProduct);
}

const receiptOption = (
  state: Readonly<MockState>,
  r: MockReceipt,
): OpnameReceiptOption => ({
  receiptId: r.id,
  supplierName: supplierNameOf(state, r),
  notaDate: r.notaDate,
});

/** Nota aktif yang memuat barang ini. */
export const activeReceiptsOf = (
  state: Readonly<MockState>,
  productId: string,
): MockReceipt[] =>
  state.receipts.filter(
    (r) =>
      r.status === "aktif" && r.lines.some((l) => l.productId === productId),
  );

/** K4 (J4): maks. 5 nota aktif terakhir yang memuat barang ini (notaDate lalu createdAt terbaru). */
export function receiptOptionsOf(
  state: Readonly<MockState>,
  productId: string,
): OpnameReceiptOption[] {
  return activeReceiptsOf(state, productId)
    .sort(
      (a, b) =>
        b.notaDate.localeCompare(a.notaDate) || b.createdAt - a.createdAt,
    )
    .slice(0, RECEIPT_OPTIONS_MAX)
    .map((r) => receiptOption(state, r));
}

function toStaffOpnameItem(
  state: Readonly<MockState>,
  i: MockOpnameItem,
): StaffOpnameItem {
  const ref = state.receipts.find((r) => r.id === i.receiptRefId);
  return {
    productId: i.productId,
    productName: i.productName,
    unitName: i.unitName,
    unitSize: i.unitSize,
    isCurah: i.isCurah,
    countedQtyBase: i.countedQtyBase,
    countedAt: i.countedAt,
    clockEstimated: i.clockEstimated,
    systemQtyBase: i.systemQtyBase,
    diffQtyBase: i.diffQtyBase,
    state: i.state,
    reason: i.reason,
    receiptRef: ref ? receiptOption(state, ref) : null,
    receiptOptions:
      i.state === "menunggu_alasan" ? receiptOptionsOf(state, i.productId) : [],
  };
}

/** K8: tanpa nilai rupiah; `systemQtyBase` baru ada setelah hitungan diterima. */
export function toStaffOpnameSession(
  state: Readonly<MockState>,
  s: MockOpnameSession,
): StaffOpnameSession {
  return {
    id: s.id,
    scope: s.scope,
    status: s.status,
    createdByName: s.createdByName,
    submittedAt: s.submittedAt,
    finishedAt: s.finishedAt,
    items: s.items
      .map((i) => toStaffOpnameItem(state, i))
      .sort((a, b) => a.productName.localeCompare(b.productName, "id")),
  };
}

const NOT_A_DIFF = new Set(["cocok", "stok_awal", "diganti"]);

export function toStaffOpnameRow(s: MockOpnameSession): StaffOpnameRow {
  return {
    id: s.id,
    scope: s.scope,
    status: s.status,
    submittedAt: s.submittedAt,
    finishedAt: s.finishedAt,
    itemCount: s.items.length,
    diffCount: s.items.filter((i) => !NOT_A_DIFF.has(i.state)).length,
    heldCount: s.items.filter((i) => i.state === "ditahan").length,
  };
}
