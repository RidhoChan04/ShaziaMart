import type {
  OpnameError,
  OpnameItemState,
  OpnameReason,
  ProductCost,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import type {
  MockOpnameItem,
  MockOpnameSession,
  MockState,
  MockUser,
} from "../db";
import { problem } from "../handlers/respond";
import { eceranOf } from "../products/views";
import {
  type CountInput,
  isWhole,
  readSessionInput,
  type SessionInput,
} from "./opname-input";
import { diffValue, effectiveCountedAt } from "./opname-value";
import { stockAt } from "./stock-at";

export const opnameProblem = (
  detail: string,
  errors: OpnameError[],
): Response => problem(422, "VALIDATION", detail, { errors });

/** Nilai rupiah selisih; `undefined` bila di luar batas aman (→ "Jumlah tidak valid"). */
export function safeValue(
  diff: number,
  cost: ProductCost | null,
): number | null | undefined {
  if (!Number.isSafeInteger(diff)) return undefined;
  try {
    return diffValue(diff, cost);
  } catch (e) {
    if (e instanceof RangeError) return undefined;
    throw e;
  }
}

/** Ledger append-only: stok dan entri berubah bersamaan; selisih 0 tidak mencatat apa pun. */
export function applyDiff(
  state: MockState,
  a: {
    productId: string;
    diffQtyBase: number;
    kind: "opname" | "stok_awal";
    sessionId: string;
    actorName: string;
    reason: OpnameReason | null;
    effectiveAt: number;
  },
  now: number,
): void {
  if (a.diffQtyBase === 0) return;
  state.stock[a.productId] = (state.stock[a.productId] ?? 0) + a.diffQtyBase;
  state.stockEntries.push({
    id: newId(now),
    productId: a.productId,
    at: now,
    effectiveAt: a.effectiveAt,
    qtyBase: a.diffQtyBase,
    actorName: a.actorName,
    kind: a.kind,
    receiptId: null,
    lineId: null,
    opnameId: a.sessionId,
    reason: a.reason,
  });
}

/** K5: sesi dengan hitungan barang ini yang lebih baru dan belum diganti (hitung ulang pemilik: jam hitung ulangnya). */
const newerCountOf = (
  state: Readonly<MockState>,
  productId: string,
  countedAt: number,
): MockOpnameSession | undefined =>
  state.opnameSessions.find((s) =>
    s.items.some(
      (i) =>
        i.productId === productId &&
        i.state !== "diganti" &&
        (i.recount?.countedAt ?? i.countedAt) > countedAt,
    ),
  );

/** Satu hitungan sah → barang sesi (belum diterapkan); string = pesan galat. */
function planItem(
  state: Readonly<MockState>,
  c: CountInput & { duplicate: boolean },
  deviceNow: number,
  now: number,
): MockOpnameItem | string {
  const p = state.products.find((x) => x.id === c.productId);
  if (!p) return "Barang tidak ditemukan";
  if (p.status === "nonaktif") return "Barang ini tidak dijual lagi";
  if (c.duplicate) return "Barang dihitung dua kali";
  if (!isWhole(c.qtyBase)) return "Jumlah tidak valid";
  if (!isWhole(c.countedAt)) return "Jam hitung tidak valid";
  const { at, estimated } = effectiveCountedAt(c.countedAt, deviceNow, now);
  if (!isWhole(at)) return "Jam hitung tidak valid";
  const system = stockAt(state, p.id, at);
  const diff = c.qtyBase - system;
  const value = safeValue(diff, p.cost);
  if (value === undefined) return "Jumlah tidak valid";
  const winner = newerCountOf(state, p.id, at);
  const first = !winner && !p.stockCounted;
  let itemState: OpnameItemState = "menunggu_alasan";
  if (winner) itemState = "diganti";
  else if (first) itemState = "stok_awal";
  else if (diff === 0) itemState = "cocok";
  const eceran = eceranOf(p);
  return {
    productId: p.id,
    productName: p.name,
    unitName: eceran.name,
    unitSize: eceran.unitSize,
    isCurah: p.isCurah,
    countedQtyBase: c.qtyBase,
    countedAt: at,
    clockEstimated: estimated,
    systemQtyBase: system,
    diffQtyBase: diff,
    // Stok awal bukan kerugian (J1): tanpa nilai.
    value: first ? null : value,
    state: itemState,
    reason: null,
    receiptRefId: null,
    resolvedByName: null,
    resolvedAt: null,
    replacedBySessionId: winner?.id ?? null,
    replacedByName: null,
    mustHold: false,
    recount: null,
  };
}

/** Semua barang dihitung dulu agar 422 atomik dengan galat per barang. */
function planItems(
  state: Readonly<MockState>,
  input: SessionInput,
  now: number,
): { items: MockOpnameItem[]; errors: OpnameError[] } {
  if (input.items.length === 0) {
    const message = "Belum ada barang yang dihitung";
    return { items: [], errors: [{ productId: null, message }] };
  }
  const items: MockOpnameItem[] = [];
  const errors: OpnameError[] = [];
  const seen = new Set<string>();
  for (const c of input.items) {
    const duplicate = seen.has(c.productId);
    seen.add(c.productId);
    const planned = planItem(state, { ...c, duplicate }, input.deviceNow, now);
    if (typeof planned === "string") {
      errors.push({ productId: c.productId, message: planned });
    } else items.push(planned);
  }
  return { items, errors };
}

/** Sesi tanpa barang menunggu alasan selesai (K2, K26). */
function settle(s: MockOpnameSession, now: number): void {
  if (s.status === "selesai") return;
  if (s.items.some((i) => i.state === "menunggu_alasan")) return;
  s.status = "selesai";
  s.finishedAt = now;
}

/** K5: hitungan lama barang ini yang belum diterapkan menjadi diganti; yang ditahan tetap terlihat pemilik (I2). */
function replaceOlder(
  state: MockState,
  productId: string,
  session: MockOpnameSession,
  now: number,
): void {
  for (const s of state.opnameSessions) {
    const old = s.items.filter(
      (i) =>
        i.productId === productId &&
        (i.state === "menunggu_alasan" || i.state === "ditahan"),
    );
    for (const i of old) {
      i.replacedByName = i.state === "ditahan" ? session.createdByName : null;
      i.state = "diganti";
      i.replacedBySessionId = session.id;
    }
    if (old.length > 0) settle(s, now);
  }
}

/**
 * I2 (pengaman 1 & 2): pengganti hitungan tertahan milik pembuat yang sama tetap menunggu pemilik
 * apa pun angkanya; selisih 0 langsung ditahan, selisih lain ditahan saat alasan disimpan.
 */
function holdIfOwnHeld(
  state: Readonly<MockState>,
  item: MockOpnameItem,
  userId: string,
): void {
  if (item.state !== "cocok" && item.state !== "menunggu_alasan") return;
  const ownHeld = state.opnameSessions.some(
    (s) =>
      s.createdById === userId &&
      s.items.some(
        (i) => i.productId === item.productId && i.state === "ditahan",
      ),
  );
  if (!ownHeld) return;
  item.mustHold = true;
  if (item.state === "cocok") item.state = "ditahan";
}

/**
 * Langkah 1 (K2): idempoten per (pembuat, id); 422 atomik dengan galat per barang. Cocok dan
 * stok awal (J1) langsung beres; selisih menunggu alasan.
 */
export function submitSession(
  state: MockState,
  user: MockUser,
  input: unknown,
  now: number,
): { status: 200 | 201; session: MockOpnameSession } | Response {
  const parsed = readSessionInput(input);
  if (parsed === null) return opnameProblem("Hitungan opname tidak valid", []);
  const saved = state.opnameSessions.find((s) => s.id === parsed.id);
  if (saved) {
    return saved.createdById === user.id
      ? { status: 200, session: saved }
      : problem(409, "ID_TAKEN", "ID ini sudah dipakai pengguna lain");
  }
  const { items, errors } = planItems(state, parsed, now);
  if (errors.length > 0) {
    return opnameProblem("Hitungan opname tidak valid", errors);
  }
  const session: MockOpnameSession = {
    id: parsed.id,
    scope: parsed.scope,
    createdById: user.id,
    createdByName: user.name,
    submittedAt: now,
    finishedAt: null,
    status: "menunggu_alasan",
    flagged: false,
    reviewedByName: null,
    reviewedAt: null,
    items,
  };
  for (const item of items) {
    if (item.state === "diganti") continue;
    holdIfOwnHeld(state, item, user.id);
    replaceOlder(state, item.productId, session, now);
    if (item.state !== "stok_awal") continue;
    applyDiff(
      state,
      {
        productId: item.productId,
        diffQtyBase: item.diffQtyBase,
        kind: "stok_awal",
        sessionId: session.id,
        actorName: user.name,
        reason: null,
        effectiveAt: item.countedAt,
      },
      now,
    );
    const p = state.products.find((x) => x.id === item.productId);
    if (p) p.stockCounted = true;
  }
  settle(session, now);
  state.opnameSessions.push(session);
  return { status: 201, session };
}
