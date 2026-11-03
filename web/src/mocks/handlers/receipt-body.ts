import type {
  NewProductInput,
  ReceiptEdit,
  ReceiptInput,
  ReceiptLineEdit,
  ReceiptLineInput,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";

// Bentuk & tipe body nota; nilai diperiksa aturan nota dengan galat per isian. Rusak → null.

const ID_MAX = 64;
const LINES_MAX = 100;

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

function readLineEdit(x: unknown): ReceiptLineEdit | null {
  if (!isObj(x)) return null;
  const { lineId, qty, unitCost, expiryDate } = x;
  const ok =
    isId(lineId) && isNum(qty) && isNum(unitCost) && isStrOrNull(expiryDate);
  return ok ? { lineId, qty, unitCost, expiryDate } : null;
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

/** Baris nota: array ≤ LINES_MAX dengan setiap baris berbentuk benar; selain itu null. */
function readLines<T>(x: unknown, read: (l: unknown) => T | null): T[] | null {
  if (!Array.isArray(x) || x.length > LINES_MAX) return null;
  const lines = x.map(read);
  return lines.every((l): l is T => l !== null) ? lines : null;
}

/** lineId wajib unik karena galat dan ubah nota merujuk baris lewat lineId. */
export function readReceiptInput(body: Obj | null): ReceiptInput | null {
  if (body === null) return null;
  const { id, supplierName, notaDate, photoId } = body;
  const lines = readLines(body.lines, readLine);
  const payment = readPayment(body.payment);
  const ok =
    isId(id) &&
    isStr(supplierName) &&
    isStr(notaDate) &&
    isStrOrNull(photoId) &&
    lines !== null &&
    payment !== null;
  if (!ok) return null;
  if (new Set(lines.map((l) => l.lineId)).size !== lines.length) return null;
  return { id, supplierName, notaDate, photoId, lines, payment };
}

/** lineId kurang, lebih, atau kembar diperiksa `checkEdit` (galat `lines`). */
export function readReceiptEdit(body: Obj | null): ReceiptEdit | null {
  if (body === null) return null;
  const { supplierName, notaDate } = body;
  const lines = readLines(body.lines, readLineEdit);
  const payment = readPayment(body.payment);
  return isStr(supplierName) &&
    isStr(notaDate) &&
    lines !== null &&
    payment !== null
    ? { supplierName, notaDate, lines, payment }
    : null;
}
