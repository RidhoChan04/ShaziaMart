import type {
  OpnameError,
  OpnameReason,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type {
  MockOpnameItem,
  MockOpnameSession,
  MockState,
  MockUser,
} from "../db";
import { problem } from "../handlers/respond";
import { applyDiff, opnameProblem, safeValue } from "./opname";
import { type ReasonInput, readReasons } from "./opname-input";
import { isHeld, sessionFlagged } from "./opname-value";
import { activeReceiptsOf } from "./opname-views";

type Resolution = {
  item: MockOpnameItem;
  reason: OpnameReason;
  receiptRefId: string | null;
  value: number | null;
};

/** Satu alasan sah untuk barang menunggu alasan; string = pesan galat; null = diabaikan (diganti). */
function resolveReason(
  state: Readonly<MockState>,
  item: MockOpnameItem,
  r: ReasonInput,
): Resolution | string | null {
  if (item.state === "diganti") return null;
  if (item.state !== "menunggu_alasan") return "Barang ini tidak perlu alasan";
  // M4: nota aktif mana pun yang memuat barang ini; 5 pilihan di layar bisa tergeser nota baru.
  const refOk =
    r.receiptId === null ||
    (r.reason === "salah_input" &&
      activeReceiptsOf(state, r.productId).some((x) => x.id === r.receiptId));
  if (!refOk) return "Nota rujukan tidak cocok";
  const cost = state.products.find((p) => p.id === item.productId)?.cost;
  // K3: dari HPP sekarang.
  const value = safeValue(item.diffQtyBase, cost ?? null);
  if (value === undefined) return "Jumlah tidak valid";
  // J4: salah input tanpa nota tercatat "Tidak diketahui".
  const unknownRef = r.reason === "salah_input" && r.receiptId === null;
  return {
    item,
    reason: unknownRef ? "tidak_diketahui" : r.reason,
    receiptRefId: r.receiptId,
    value,
  };
}

function resolveReasons(
  state: Readonly<MockState>,
  session: MockOpnameSession,
  reasons: ReasonInput[],
): { resolved: Resolution[]; errors: OpnameError[] } {
  const resolved: Resolution[] = [];
  const errors: OpnameError[] = [];
  const given = new Set<string>();
  for (const r of reasons) {
    const item = session.items.find((i) => i.productId === r.productId);
    let result: Resolution | string | null;
    if (given.has(r.productId)) result = "Barang dihitung dua kali";
    else if (!item) result = "Barang tidak ditemukan";
    else result = resolveReason(state, item, r);
    given.add(r.productId);
    if (typeof result === "string") {
      errors.push({ productId: r.productId, message: result });
    } else if (result !== null) resolved.push(result);
  }
  for (const i of session.items) {
    if (i.state === "menunggu_alasan" && !given.has(i.productId)) {
      errors.push({ productId: i.productId, message: "Pilih alasan" });
    }
  }
  return { resolved, errors };
}

/**
 * Langkah 2 (K2): alasan untuk tepat setiap barang menunggu alasan; ≤ batas → disesuaikan
 * (waktu efektif = jam hitung, K7), selain itu ditahan (J2, J3). Sesi selesai → apa adanya.
 */
export function finishSession(
  state: MockState,
  user: MockUser,
  sessionId: string,
  input: unknown,
  now: number,
): MockOpnameSession | Response {
  const session = state.opnameSessions.find(
    (s) => s.id === sessionId && s.createdById === user.id,
  );
  if (!session) return problem(404, "NOT_FOUND", "Sesi opname tidak ditemukan");
  if (session.status === "selesai") return session;
  const reasons = readReasons(input);
  if (reasons === null) return opnameProblem("Alasan opname tidak valid", []);
  const { resolved, errors } = resolveReasons(state, session, reasons);
  if (errors.length > 0) {
    return opnameProblem("Alasan opname tidak valid", errors);
  }
  const { opnameItemLimit, opnameSessionLimit } = state.stockRules;
  for (const { item, reason, receiptRefId, value } of resolved) {
    item.reason = reason;
    item.receiptRefId = receiptRefId;
    item.value = value;
    item.state =
      item.mustHold || isHeld(value, opnameItemLimit)
        ? "ditahan"
        : "disesuaikan";
    if (item.state === "ditahan") continue;
    applyDiff(
      state,
      {
        productId: item.productId,
        diffQtyBase: item.diffQtyBase,
        kind: "opname",
        sessionId: session.id,
        actorName: user.name,
        reason,
        effectiveAt: item.countedAt,
      },
      now,
    );
  }
  session.flagged = sessionFlagged(
    resolved.map((r) => r.value),
    opnameSessionLimit,
  );
  session.status = "selesai";
  session.finishedAt = now;
  return session;
}
