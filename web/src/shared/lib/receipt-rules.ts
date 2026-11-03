import type {
  NewProductInput,
  ProductBaseUnit,
  ReceiptError,
  ReceiptField,
  ReceiptPayment,
  StaffUnit,
} from "../api/gen/shaziaMartAPI.schemas";
import { isIsoDate, isoDaysBetween } from "./business-day";
import { isValidBarcode, sellUnitKind } from "./product-rules";

/**
 * Baris draf nota di HP (form orang toko). Dipakai lembar baris dan penyimpan draf;
 * isian berupa teks mentah sampai dikirim.
 */
export type DraftLine = {
  lineId: string;
  /** Salinan barang untuk tampil offline. */
  product: {
    id: string;
    name: string;
    category: string | null;
    baseUnit: ProductBaseUnit;
    units: StaffUnit[];
  } | null;
  unitId: string | null;
  newProduct: {
    name: string;
    sellUnit: string;
    notaUnit: string;
    notaUnitSize: string;
    barcode: string;
  } | null;
  qty: number;
  unitCostText: string;
  expiryDate: string | null;
};

/** "Mendekati jatuh tempo" = 0–3 hari sebelum jatuh tempo (termasuk hari H). */
export const DUE_SOON_DAYS = 3;

export type DebtStage = "lewat" | "segera" | "nanti";

/** Tahap utang menurut tanggal kalender: lewat (< 0 hari), segera (0–3), nanti. */
export function debtStage(dueDate: string, today: string): DebtStage {
  const days = isoDaysBetween(today, dueDate);
  if (days < 0) return "lewat";
  return days <= DUE_SOON_DAYS ? "segera" : "nanti";
}

/** `qty × unitCost` rupiah; RangeError bila masukan/hasil bukan bilangan bulat aman. */
export function receiptLineTotal(qty: number, unitCost: number): number {
  const total = qty * unitCost;
  if (
    !Number.isSafeInteger(qty) ||
    !Number.isSafeInteger(unitCost) ||
    !Number.isSafeInteger(total)
  ) {
    throw new RangeError(`Subtotal di luar batas aman: ${qty} x ${unitCost}`);
  }
  return total;
}

export function receiptTotal(
  lines: readonly { qty: number; unitCost: number }[],
): number {
  let total = 0;
  for (const l of lines) {
    total += receiptLineTotal(l.qty, l.unitCost);
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Total nota di luar batas aman");
    }
  }
  return total;
}

/** Baris yang diperiksa: isian boleh belum lengkap (null). */
export type CheckLine = {
  lineId: string;
  productId: string | null;
  unitId: string | null;
  newProduct: NewProductInput | null;
  qty: number | null;
  unitCost: number | null;
  expiryDate: string | null;
};

export type CheckReceipt = {
  supplierName: string;
  notaDate: string;
  lines: CheckLine[];
  payment: ReceiptPayment;
};

const err = (
  lineId: string | null,
  field: ReceiptField,
  message: string,
): ReceiptError => ({ lineId, field, message });

/** Kunci banding nama/satuan: tanpa beda huruf dan spasi ujung. */
const fold = (s: string): string => s.trim().toLowerCase();

function newProductErrors(
  lineId: string,
  n: NewProductInput,
  seen: { names: Set<string>; barcodes: Set<string> },
): ReceiptError[] {
  const out: ReceiptError[] = [];
  const name = fold(n.name);
  const sellUnit = fold(n.sellUnit);
  const notaUnit = fold(n.notaUnit);
  if (name === "") out.push(err(lineId, "newName", "Nama barang belum diisi"));
  if (sellUnit === "") {
    out.push(err(lineId, "newSellUnit", "'Dijual per' belum diisi"));
  }
  if (notaUnit === "") {
    out.push(err(lineId, "newNotaUnit", "Satuan di nota belum diisi"));
  }
  if (
    sellUnit !== "" &&
    notaUnit !== "" &&
    notaUnit !== sellUnit &&
    !(Number.isSafeInteger(n.notaUnitSize) && n.notaUnitSize >= 2)
  ) {
    out.push(
      err(lineId, "newNotaUnitSize", "Satuan besar: isi berapa? (min. 2)"),
    );
  }
  const barcode = n.barcode;
  const barcodeOk = barcode !== null && isValidBarcode(barcode);
  if (barcode !== null && !barcodeOk) {
    out.push(err(lineId, "newBarcode", "Barcode salah, scan ulang"));
  }
  if (name !== "") {
    if (seen.names.has(name)) {
      out.push(err(lineId, "newName", "Nama sama dengan baris lain"));
    }
    seen.names.add(name);
  }
  if (barcodeOk) {
    if (seen.barcodes.has(barcode)) {
      out.push(err(lineId, "newBarcode", "Barcode sama dengan baris lain"));
    }
    seen.barcodes.add(barcode);
  }
  return out;
}

/** Tepat salah satu: barang terdaftar (`productId`) atau barang baru (`newProduct`). */
function productChoiceError(l: CheckLine): ReceiptError | null {
  if (l.productId === null && l.newProduct === null) {
    return err(l.lineId, "product", "Pilih barang atau buat barang baru");
  }
  if (l.productId !== null && l.newProduct !== null) {
    return err(
      l.lineId,
      "product",
      "Pilih salah satu: barang terdaftar atau barang baru",
    );
  }
  return null;
}

function qtyError(l: CheckLine): ReceiptError | null {
  if (l.qty === null || l.qty <= 0) {
    return err(l.lineId, "qty", "Jumlah minimal 1");
  }
  if (!Number.isSafeInteger(l.qty)) {
    return err(l.lineId, "qty", "Jumlah harus bilangan bulat");
  }
  return null;
}

function unitCostError(l: CheckLine): ReceiptError | null {
  if (l.unitCost === null) {
    return err(l.lineId, "unitCost", "Harga beli belum diisi");
  }
  if (l.unitCost < 0) {
    return err(l.lineId, "unitCost", "Harga beli: ketik angka saja, mis. 3500");
  }
  if (!Number.isSafeInteger(l.unitCost)) {
    return err(l.lineId, "unitCost", "Harga harus bilangan bulat");
  }
  return null;
}

/** R13: subtotal, total, atau jumlah satuan dasar di luar bilangan bulat aman (dipakai juga server). */
export const RECEIPT_TOO_LARGE =
  "Angka terlalu besar — periksa jumlah dan harga beli";

/** Total berjalan atas baris yang jumlah & harganya sah; galat sekali di baris yang melewati batas. */
function totalError(
  l: CheckLine,
  running: { total: number; over: boolean },
): ReceiptError | null {
  if (running.over || l.qty === null || l.unitCost === null) return null;
  if (qtyError(l) !== null || unitCostError(l) !== null) return null;
  const total = running.total + l.qty * l.unitCost;
  if (Number.isSafeInteger(l.qty * l.unitCost) && Number.isSafeInteger(total)) {
    running.total = total;
    return null;
  }
  running.over = true;
  return err(l.lineId, "unitCost", RECEIPT_TOO_LARGE);
}

function lineErrors(
  l: CheckLine,
  seen: { names: Set<string>; barcodes: Set<string> },
): ReceiptError[] {
  const out: ReceiptError[] = [];
  const choice = productChoiceError(l);
  if (choice !== null) out.push(choice);
  if (l.productId !== null && l.unitId === null) {
    out.push(err(l.lineId, "unit", "Satuan ini tidak dipakai lagi"));
  }
  if (l.newProduct !== null) {
    out.push(...newProductErrors(l.lineId, l.newProduct, seen));
  }
  for (const e of [qtyError(l), unitCostError(l)]) if (e !== null) out.push(e);
  if (l.expiryDate !== null && !isIsoDate(l.expiryDate)) {
    out.push(err(l.lineId, "expiryDate", "Tanggal kedaluwarsa tidak valid"));
  }
  return out;
}

/**
 * Aturan nota tanpa data server (dipakai form untuk pratinjau dan server untuk keputusan).
 * Urutan: tingkat nota, baris sesuai urutan, lalu pembayaran. Nama/barcode kembar
 * ditandai pada baris berikutnya, bukan baris pertama.
 */
export function validateReceipt(
  r: CheckReceipt,
  ctx: { today: string; shiftOpen: boolean },
): ReceiptError[] {
  const out: ReceiptError[] = [];
  if (r.supplierName.trim() === "") {
    out.push(err(null, "supplierName", "Supplier belum diisi"));
  }
  const notaDateErr = dateError(
    r.notaDate,
    "notaDate",
    "Tanggal nota belum diisi",
  );
  if (notaDateErr !== null) {
    out.push(notaDateErr);
  } else if (r.notaDate > ctx.today) {
    out.push(
      err(null, "notaDate", "Tanggal nota tidak boleh setelah hari ini"),
    );
  }
  if (r.lines.length === 0) {
    out.push(err(null, "lines", "Belum ada barang di nota"));
  }
  const seen = { names: new Set<string>(), barcodes: new Set<string>() };
  const running = { total: 0, over: false };
  for (const l of r.lines) {
    out.push(...lineErrors(l, seen));
    const tooLarge = totalError(l, running);
    if (tooLarge !== null) out.push(tooLarge);
  }
  out.push(...validatePayment(r.payment, r.notaDate, ctx.shiftOpen));
  return out;
}

/** Tanggal wajib: kosong → `emptyMessage`; bukan `YYYY-MM-DD` sah → format tidak sah. */
function dateError(
  value: string | null,
  field: ReceiptField,
  emptyMessage: string,
): ReceiptError | null {
  if (value === null || value.trim() === "") {
    return err(null, field, emptyMessage);
  }
  return isIsoDate(value) ? null : err(null, field, "Format tanggal tidak sah");
}

function laterPaymentErrors(
  p: ReceiptPayment,
  notaDate: string,
): ReceiptError[] {
  const out: ReceiptError[] = [];
  // Penjaga sisi server: UI orang toko tidak pernah mengirim cara bayar untuk Bayar nanti.
  if (p.method !== null || p.cashSource !== null) {
    out.push(
      err(null, "payment", "Cara bayar dipilih saat pemilik menandai lunas"),
    );
  }
  const dueErr = dateError(p.dueDate, "dueDate", "Jatuh tempo belum diisi");
  if (dueErr !== null) {
    out.push(dueErr);
  } else if (
    isIsoDate(notaDate) &&
    p.dueDate !== null &&
    p.dueDate < notaDate
  ) {
    out.push(
      err(null, "dueDate", "Jatuh tempo tidak boleh sebelum tanggal nota"),
    );
  }
  return out;
}

function cashSourceError(
  p: ReceiptPayment,
  shiftOpen: boolean,
): ReceiptError | null {
  if (p.method === "transfer") {
    return p.cashSource === null
      ? null
      : err(
          null,
          "cashSource",
          "Transfer tidak memakai uang dari laci atau pemilik",
        );
  }
  if (p.cashSource === null) {
    return err(
      null,
      "cashSource",
      "Pilih uang dari mana: laci atau uang pemilik",
    );
  }
  if (p.cashSource === "laci" && !shiftOpen) {
    return err(
      null,
      "cashSource",
      "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
    );
  }
  return null;
}

/**
 * sekarang: cara bayar wajib; tunai wajib sumber uang (laci hanya bila ada shift buka);
 * transfer tanpa sumber uang; tanpa jatuh tempo. nanti: jatuh tempo wajib, tidak sebelum
 * tanggal nota; cara bayar & sumber uang dipilih saat pelunasan (harus null).
 */
export function validatePayment(
  p: ReceiptPayment,
  notaDate: string,
  shiftOpen: boolean,
): ReceiptError[] {
  if (p.timing === "nanti") return laterPaymentErrors(p, notaDate);
  const out: ReceiptError[] = [];
  if (p.dueDate !== null) {
    out.push(err(null, "dueDate", "Jatuh tempo hanya untuk Bayar nanti"));
  }
  if (p.method === null) {
    out.push(err(null, "payment", "Cara bayar belum dipilih"));
    return out;
  }
  const cash = cashSourceError(p, shiftOpen);
  if (cash !== null) out.push(cash);
  return out;
}

/**
 * Satuan barang baru dari nota: eceran = `Dijual per`; satuan nota berbeda (tanpa beda
 * huruf) = satuan besar berisi `notaUnitSize` eceran. `Dijual per` kosong → null.
 */
export function newProductUnits(n: NewProductInput): {
  eceran: { name: string; unitSize: number };
  nota: { name: string; unitSize: number } | null;
} | null {
  const kind = sellUnitKind(n.sellUnit);
  if (kind === null) return null;
  const eceran = { name: n.sellUnit.trim(), unitSize: kind.unitSize };
  if (fold(n.notaUnit) === fold(n.sellUnit)) return { eceran, nota: null };
  const unitSize = n.notaUnitSize * eceran.unitSize;
  if (!Number.isSafeInteger(unitSize)) {
    throw new RangeError(
      `Isi satuan nota di luar batas aman: ${n.notaUnitSize}`,
    );
  }
  return { eceran, nota: { name: n.notaUnit.trim(), unitSize } };
}
