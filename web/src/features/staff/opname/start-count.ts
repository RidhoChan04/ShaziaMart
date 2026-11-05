import type { OpnameScope } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { listStaffOpnameProducts } from "@/shared/api/gen/staff/staff";
import { newId } from "@/shared/lib/id";
import { sameScope } from "@/shared/lib/stock-rules";
import type { OpnameDraft } from "./opname-draft-types";

/** Draf `counting` milik pengguna di lingkup ini (K14): dilanjutkan, bukan dibuat baru. */
export function countingDraftFor(
  scope: OpnameScope,
  userId: string,
  drafts: readonly OpnameDraft[],
): OpnameDraft | undefined {
  return drafts.find(
    (d) =>
      d.userId === userId &&
      d.status === "counting" &&
      sameScope(d.scope, scope),
  );
}

/**
 * Mulai menghitung satu lingkup; kembalian = ID draf. Lingkup yang masih punya draf `counting`
 * milik pengguna membuka draf itu (tanpa menyentuh server). Selain itu daftar barang diambil dari
 * server (tanpa stok, K15) dan disalin ke draf baru agar bisa dihitung offline.
 */
export async function startCount(
  scope: OpnameScope,
  userId: string,
  drafts: readonly OpnameDraft[],
  save: (d: OpnameDraft) => Promise<void>,
  now: number,
): Promise<string> {
  const existing = countingDraftFor(scope, userId, drafts);
  if (existing) return existing.id;
  const products = await listStaffOpnameProducts(
    scope.kind === "kategori" && scope.category !== null
      ? { lingkup: "kategori", kategori: scope.category }
      : { lingkup: scope.kind },
  );
  if (products.length === 0) {
    throw new Error("Tidak ada barang untuk dihitung");
  }
  const draft: OpnameDraft = {
    id: newId(now),
    userId,
    createdAt: now,
    updatedAt: now,
    status: "counting",
    scope,
    products,
    counts: {},
    errors: [],
  };
  await save(draft);
  return draft.id;
}
