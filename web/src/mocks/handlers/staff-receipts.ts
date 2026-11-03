import { HttpResponse, http } from "msw";
import type {
  NewProductInput,
  ReceiptError,
  ReceiptInput,
  ReceiptLineInput,
  ReceiptPayment,
  StaffReceiptRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockReceipt, mockDb } from "../db";
import { mockPhotos } from "../photos";
import { checkReceipt } from "../receipts/check";
import { applyReceipt } from "../receipts/receive";
import { toStaffReceipt, toStaffReceiptRow } from "../receipts/views";
import { withScenario } from "../scenarios";
import { problem, readJson, requireOwnerSession } from "./respond";
import { requireStaffSession, staffRealm } from "./staff-realm";

const BASE = "/api/staff/receipts";
const ID_MAX = 64;
const LINES_MAX = 100;
const PHOTO_MAX_BYTES = 1024 * 1024;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isNum = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const isStrOrNull = (x: unknown): x is string | null => x === null || isStr(x);
const isId = (x: unknown): x is string =>
  isStr(x) && x.length > 0 && x.length <= ID_MAX;
const isOneOf = <T extends string>(
  x: unknown,
  values: readonly (T | null)[],
): x is T | null => values.includes(x as T | null);

function readNewProduct(x: unknown): NewProductInput | null | undefined {
  if (x === null) return null;
  if (!isObj(x)) return undefined;
  const { name, sellUnit, notaUnit, notaUnitSize, barcode } = x;
  return isStr(name) &&
    isStr(sellUnit) &&
    isStr(notaUnit) &&
    isNum(notaUnitSize) &&
    isStrOrNull(barcode)
    ? { name, sellUnit, notaUnit, notaUnitSize, barcode }
    : undefined;
}

function readLine(x: unknown): ReceiptLineInput | null {
  if (!isObj(x)) return null;
  const { lineId, productId, unitId, qty, unitCost, expiryDate } = x;
  const newProduct = readNewProduct(x.newProduct);
  const ok =
    isId(lineId) &&
    isStrOrNull(productId) &&
    isStrOrNull(unitId) &&
    newProduct !== undefined &&
    isNum(qty) &&
    isNum(unitCost) &&
    isStrOrNull(expiryDate);
  return ok
    ? { lineId, productId, unitId, newProduct, qty, unitCost, expiryDate }
    : null;
}

function readPayment(x: unknown): ReceiptPayment | null {
  if (!isObj(x)) return null;
  const { timing, method, cashSource, dueDate } = x;
  const ok =
    (timing === "sekarang" || timing === "nanti") &&
    isOneOf(method, ["tunai", "transfer", null]) &&
    isOneOf(cashSource, ["laci", "pemilik", null]) &&
    isStrOrNull(dueDate);
  return ok ? { timing, method, cashSource, dueDate } : null;
}

/**
 * Bentuk & tipe body (nilai diperiksa `checkReceipt` dengan galat per isian); null bila rusak.
 * lineId wajib unik karena galat dan ubah nota merujuk baris lewat lineId.
 */
function readReceiptInput(body: Obj | null): ReceiptInput | null {
  if (body === null) return null;
  const { id, supplierName, notaDate, photoId } = body;
  const raw = Array.isArray(body.lines) ? body.lines : null;
  const lines = raw?.map(readLine) ?? [];
  const payment = readPayment(body.payment);
  const ok =
    isId(id) &&
    isStr(supplierName) &&
    isStr(notaDate) &&
    isStrOrNull(photoId) &&
    raw !== null &&
    raw.length <= LINES_MAX &&
    payment !== null;
  const valid = lines.filter((l): l is ReceiptLineInput => l !== null);
  if (!ok || valid.length !== lines.length) return null;
  if (new Set(valid.map((l) => l.lineId)).size !== valid.length) return null;
  return { id, supplierName, notaDate, photoId, lines: valid, payment };
}

const receiptProblem = (errors: ReceiptError[]): Response =>
  problem(422, "VALIDATION", "Nota tidak valid", { errors });

const idTaken = (): Response =>
  problem(409, "ID_TAKEN", "ID ini sudah dipakai pengguna lain");

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Nota tidak ditemukan");

const jpeg = (bytes: Uint8Array): Response =>
  new HttpResponse(bytes.slice().buffer, {
    headers: { "Content-Type": "image/jpeg" },
  });

/** JPEG diawali penanda SOI FF D8 FF. */
const isJpeg = (b: Uint8Array): boolean =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export const staffReceiptHandlers = [
  http.post(
    BASE,
    staffRealm(async ({ request }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const input = readReceiptInput(await readJson(request));
      if (input === null) return receiptProblem([]);
      // R7: replay hanya untuk pembuatnya, tanpa validasi ulang dan tanpa mencatat ulang.
      const saved = state.receipts.find((r) => r.id === input.id);
      if (saved) {
        return saved.createdById === user.id
          ? HttpResponse.json(toStaffReceipt(state, saved))
          : idTaken();
      }
      const now = Date.now();
      const errors = checkReceipt(state, input, user.id, now);
      if (errors.length > 0) return receiptProblem(errors);
      let created: MockReceipt | null = null;
      mockDb.update((s) => {
        created = applyReceipt(s, input, user, now);
      });
      if (created === null) throw new Error("Nota tidak tersimpan");
      return HttpResponse.json(toStaffReceipt(mockDb.get(), created), {
        status: 201,
      });
    }),
  ),
  http.get(
    BASE,
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const rows: StaffReceiptRow[] = state.receipts
        .filter((r) => r.createdById === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => toStaffReceiptRow(state, r));
      return HttpResponse.json(rows);
    }),
  ),
  http.get(
    `${BASE}/:receiptId`,
    staffRealm(({ params }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const r = state.receipts.find(
        (x) => x.id === String(params.receiptId) && x.createdById === user.id,
      );
      return r ? HttpResponse.json(toStaffReceipt(state, r)) : notFound();
    }),
  ),
  http.put(
    "/api/staff/receipt-photos/:photoId",
    staffRealm(async ({ params, request }) => {
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const id = String(params.photoId);
      const bytes = new Uint8Array(await request.arrayBuffer());
      const stored = mockPhotos.load(id);
      // Foto terikat pengunggah: id milik orang lain tidak pernah ditimpa.
      if (stored && stored.ownerId !== user.id) return idTaken();
      if (bytes.length > PHOTO_MAX_BYTES) {
        return problem(
          422,
          "VALIDATION",
          "Foto nota terlalu besar (maks. 1 MB)",
        );
      }
      if (!isJpeg(bytes)) {
        return problem(422, "VALIDATION", "Foto nota harus JPEG");
      }
      // Idempoten: unggah ulang oleh pengunggah yang sama tidak mengubah foto tersimpan.
      if (!stored) mockPhotos.save(id, user.id, bytes);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(
    "/api/staff/receipt-photos/:photoId",
    staffRealm(({ params }) => {
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const stored = mockPhotos.load(String(params.photoId));
      return stored?.ownerId === user.id
        ? jpeg(stored.bytes)
        : problem(404, "NOT_FOUND", "Foto nota tidak ditemukan");
    }),
  ),
  http.get(
    "/api/owner/receipt-photos/:photoId",
    withScenario(({ params }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const stored = mockPhotos.load(String(params.photoId));
      return stored
        ? jpeg(stored.bytes)
        : problem(404, "NOT_FOUND", "Foto nota tidak ditemukan");
    }),
  ),
];
