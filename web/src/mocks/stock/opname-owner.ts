import type {
  OpnameFlag,
  OwnerOpnameItem,
  OwnerOpnameRow,
  OwnerOpnameSession,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type {
  MockOpnameItem,
  MockOpnameSession,
  MockState,
  MockUser,
} from "../db";
import { invalid, problem } from "../handlers/respond";
import { toStaffProduct } from "../products/views";
import { applyDiff, safeValue } from "./opname";
import { isWhole } from "./opname-input";
import { toStaffOpnameRow, toStaffOpnameSession } from "./opname-views";

const sessionNotFound = (): Response =>
  problem(404, "NOT_FOUND", "Sesi opname tidak ditemukan");

/** K26: nilai rupiah yang dihitung per state; hitung ulang pemilik memakai nilai hitung ulangnya. */
function countedDiff(i: MockOpnameItem): { diff: number; value: number } {
  switch (i.state) {
    case "menunggu_alasan":
    case "disesuaikan":
    case "ditahan":
    case "disetujui":
      return { diff: i.diffQtyBase, value: i.value ?? 0 };
    case "dihitung_ulang":
      return {
        diff: i.recount?.diffQtyBase ?? 0,
        value: i.recount?.value ?? 0,
      };
    default:
      return { diff: 0, value: 0 };
  }
}

/** K26: kurang → loss, lebih → gain; total = loss + gain. */
function sessionValues(s: MockOpnameSession) {
  let lossValue = 0;
  let gainValue = 0;
  for (const i of s.items) {
    const { diff, value } = countedDiff(i);
    if (diff < 0) lossValue += value;
    else if (diff > 0) gainValue += value;
  }
  return { lossValue, gainValue, totalValue: lossValue + gainValue };
}

/** Detail pemilik: field staf + nilai rupiah, penyelesaian, dan satuan aktif sekarang (hitung ulang). */
export function toOwnerOpnameSession(
  state: Readonly<MockState>,
  s: MockOpnameSession,
): OwnerOpnameSession {
  const staff = toStaffOpnameSession(state, s);
  const items = staff.items.map((item): OwnerOpnameItem => {
    const i = s.items.find((x) => x.productId === item.productId);
    const p = state.products.find((x) => x.id === item.productId);
    return {
      ...item,
      value: i?.value ?? null,
      units: p ? toStaffProduct(p).units : [],
      resolvedByName: i?.resolvedByName ?? null,
      resolvedAt: i?.resolvedAt ?? null,
      replacedBySessionId: i?.replacedBySessionId ?? null,
      recount: i?.recount ?? null,
    };
  });
  return {
    ...staff,
    items,
    ...sessionValues(s),
    flagged: s.flagged,
    reviewedByName: s.reviewedByName,
    reviewedAt: s.reviewedAt,
  };
}

export function toOwnerOpnameRow(s: MockOpnameSession): OwnerOpnameRow {
  const { id, scope, status, submittedAt, finishedAt, ...counts } =
    toStaffOpnameRow(s);
  return {
    id,
    scope,
    status,
    createdByName: s.createdByName,
    submittedAt,
    finishedAt,
    ...counts,
    totalValue: sessionValues(s).totalValue,
    flagged: s.flagged,
    reviewed: s.reviewedAt !== null,
  };
}

/** Sesi + barang yang ditahan; selain itu 404 / 409 OPNAME_NOT_HELD. */
function heldItem(
  state: MockState,
  sessionId: string,
  productId: string,
): { session: MockOpnameSession; item: MockOpnameItem } | Response {
  const session = state.opnameSessions.find((s) => s.id === sessionId);
  if (!session) return sessionNotFound();
  const item = session.items.find((i) => i.productId === productId);
  if (!item) return problem(404, "NOT_FOUND", "Barang tidak ada di sesi ini");
  if (item.state !== "ditahan") {
    const detail = "Barang ini tidak lagi menunggu persetujuan";
    return problem(409, "OPNAME_NOT_HELD", detail);
  }
  return { session, item };
}

/** Setujui: selisih asli diterapkan sekali, berlaku pada jam hitung asli (K7). */
export function approveItem(
  state: MockState,
  sessionId: string,
  productId: string,
  owner: MockUser,
  now: number,
): MockOpnameSession | Response {
  const found = heldItem(state, sessionId, productId);
  if (found instanceof Response) return found;
  const { session, item } = found;
  applyDiff(
    state,
    {
      productId,
      diffQtyBase: item.diffQtyBase,
      kind: "opname",
      sessionId,
      actorName: owner.name,
      reason: item.reason,
      effectiveAt: item.countedAt,
    },
    now,
  );
  item.state = "disetujui";
  item.resolvedByName = owner.name;
  item.resolvedAt = now;
  return session;
}

/**
 * Hitung ulang pemilik (J5): selisih terhadap stok sekarang, langsung disesuaikan tanpa batas dan
 * berlaku sekarang; `recount.countedAt = now` menjadi jam hitung barang ini untuk K5.
 */
export function recountItem(
  state: MockState,
  sessionId: string,
  productId: string,
  owner: MockUser,
  input: unknown,
  now: number,
): MockOpnameSession | Response {
  const found = heldItem(state, sessionId, productId);
  if (found instanceof Response) return found;
  const { session, item } = found;
  const qtyBase =
    typeof input === "object" && input !== null && "qtyBase" in input
      ? input.qtyBase
      : undefined;
  if (!isWhole(qtyBase)) return invalid("Jumlah tidak valid");
  const system = state.stock[productId] ?? 0;
  const diff = qtyBase - system;
  const cost = state.products.find((p) => p.id === productId)?.cost ?? null;
  const value = safeValue(diff, cost);
  if (value === undefined) return invalid("Jumlah tidak valid");
  applyDiff(
    state,
    {
      productId,
      diffQtyBase: diff,
      kind: "opname",
      sessionId,
      actorName: owner.name,
      reason: item.reason,
      effectiveAt: now,
    },
    now,
  );
  item.state = "dihitung_ulang";
  item.recount = {
    countedQtyBase: qtyBase,
    countedAt: now,
    systemQtyBase: system,
    diffQtyBase: diff,
    value,
  };
  item.resolvedByName = owner.name;
  item.resolvedAt = now;
  return session;
}

/** Tandai ditinjau; idempoten, `flagged` tidak berubah. */
export function reviewSession(
  state: MockState,
  sessionId: string,
  owner: MockUser,
  now: number,
): MockOpnameSession | Response {
  const session = state.opnameSessions.find((s) => s.id === sessionId);
  if (!session) return sessionNotFound();
  if (session.reviewedAt !== null) return session;
  session.reviewedByName = owner.name;
  session.reviewedAt = now;
  return session;
}

/** K19: barang ditahan, dan sesi bertanda selisih besar yang belum ditinjau (terbaru dulu). */
export function opnameAttention(state: Readonly<MockState>): {
  opnameHeldCount: number;
  opnameFlags: OpnameFlag[];
} {
  const opnameHeldCount = state.opnameSessions
    .flatMap((s) => s.items)
    .filter((i) => i.state === "ditahan").length;
  const opnameFlags = state.opnameSessions
    .filter((s) => s.flagged && s.reviewedAt === null)
    .map(
      (s): OpnameFlag => ({
        sessionId: s.id,
        scope: s.scope,
        finishedAt: s.finishedAt ?? s.submittedAt,
        totalValue: sessionValues(s).totalValue,
      }),
    )
    .sort((a, b) => b.finishedAt - a.finishedAt);
  return { opnameHeldCount, opnameFlags };
}
