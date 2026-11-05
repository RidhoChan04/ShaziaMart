import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import {
  kasirVoidWindow,
  type MockSale,
  type MockState,
  type MockUser,
  type MockVoidRefund,
} from "../db";
import { appendCredit } from "../ledger";
import { productOfUnit } from "../products/views";
import { invalid, problem } from "./respond";

const REASON_MAX = 200;

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const amountOf = (sale: Sale, method: "cash" | "qris" | "credit"): number =>
  sale.payments.find((p) => p.method === method)?.amount ?? 0;

/** Alasan 1..200 karakter setelah trim; null = tidak valid. */
function readReason(input: unknown): string | null {
  const reason = isObj(input) ? input.reason : undefined;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed.length >= 1 && trimmed.length <= REASON_MAX ? trimmed : null;
}

/** (K31) `laci` / `pemilik`; nilai lain (termasuk tanpa nilai) = null. */
function readQrisSource(input: unknown): "laci" | "pemilik" | null {
  const v = isObj(input) ? input.qrisRefundSource : undefined;
  return v === "laci" || v === "pemilik" ? v : null;
}

/** Proyeksi penjualan untuk kasir: hanya key allowlist kontrak (tanpa HPP & data pengecualian). */
export function toPublicSale(s: MockSale): Sale {
  return {
    id: s.id,
    number: s.number,
    createdAt: s.createdAt,
    kasirName: s.kasirName,
    shiftId: s.shiftId,
    items: s.items,
    total: s.total,
    payments: s.payments,
    cashReceived: s.cashReceived,
    change: s.change,
    customerId: s.customerId,
    status: s.status,
    printStatus: s.printStatus,
  };
}

/** Stok kembali dan bagian kasbon dibalik di buku (saldo boleh minus — Q8). */
function restoreGoodsAndCredit(s: MockState, sale: MockSale, now: number) {
  for (const item of sale.items) {
    const productId = productOfUnit(s, item.unitId)?.id;
    if (productId)
      s.stock[productId] = (s.stock[productId] ?? 0) + item.qtyBase;
  }
  const credit = amountOf(sale, "credit");
  if (sale.customerId && credit > 0) {
    appendCredit(s, {
      customerId: sale.customerId,
      amount: -credit,
      at: now,
      saleId: sale.id,
      paymentId: null,
    });
  }
}

/** Jalur kasir (K28, K31): laci dikoreksi di shift yang buka; Response = penolakan. */
function kasirRefund(
  s: MockState,
  sale: MockSale,
  input: unknown,
  now: number,
): MockVoidRefund | Response {
  const cash = amountOf(sale, "cash");
  const qris = amountOf(sale, "qris");
  const qrisSource = qris > 0 ? readQrisSource(input) : null;
  if (qris > 0 && qrisSource === null) {
    return invalid("Pilih cara mengembalikan QRIS");
  }
  const { shift } = s;
  if (!shift) {
    return problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");
  }
  const window = kasirVoidWindow(sale, shift, now);
  if (window === "terlalu_lama") {
    return problem(
      409,
      "VOID_TOO_OLD",
      "Transaksi lebih dari 7 hari — batalkan dari app pemilik",
    );
  }
  // Shift ini: bagian tunai lewat cashSales (tidak dihitung dua kali); shift lama: tunai keluar laci.
  const drawer =
    (window === "shift_lama" ? cash : 0) + (qrisSource === "laci" ? qris : 0);
  restoreGoodsAndCredit(s, sale, now);
  if (window === "shift_ini") {
    shift.cashSales -= cash;
    shift.salesCount -= 1;
  }
  if (drawer > 0) {
    shift.saleRefunds.push({
      id: newId(now),
      at: now,
      amount: drawer,
      saleId: sale.id,
    });
  }
  return { cash, qris, qrisSource, drawer };
}

/**
 * Batalkan penjualan (ruling R4/R12, jawaban pemilik Q1/Q8, K28–K31), idempoten. Urutan: 404 →
 * sudah batal → 200 rekaman asli → alasan 422 → kasir: QRIS tanpa sumber 422 → tanpa shift 409
 * SHIFT_CLOSED → > 7 hari 409 VOID_TOO_OLD; pemilik: shift penjualan masih buka 409 IN_OPEN_SHIFT
 * (laci tidak pernah dikoreksi, umur tidak dibatasi). Jam = `now` server.
 */
export function voidSaleAs(
  s: MockState,
  saleId: string,
  by: { user: MockUser; channel: "kasir" | "pemilik" },
  input: unknown,
  now: number,
): MockSale | Response {
  const sale = s.sales.find((x) => x.id === saleId);
  if (!sale) return problem(404, "NOT_FOUND", "Penjualan tidak ditemukan");
  if (sale.status === "dibatalkan") return sale;
  const reason = readReason(input);
  if (reason === null) {
    return invalid("Alasan wajib diisi (maksimal 200 karakter)");
  }
  let refund: MockVoidRefund;
  if (by.channel === "kasir") {
    const res = kasirRefund(s, sale, input, now);
    if (res instanceof Response) return res;
    refund = res;
  } else {
    if (s.shift !== null && sale.shiftId === s.shift.id) {
      return problem(
        409,
        "IN_OPEN_SHIFT",
        "Masih di shift yang buka — batalkan dari kasir",
      );
    }
    restoreGoodsAndCredit(s, sale, now);
    const qris = amountOf(sale, "qris");
    refund = {
      cash: amountOf(sale, "cash"),
      qris,
      qrisSource: qris > 0 ? "pemilik" : null,
      drawer: 0,
    };
  }
  sale.status = "dibatalkan";
  sale.voidedAt = now;
  sale.voidedById = by.user.id;
  sale.voidedByName = by.user.name;
  sale.voidReason = reason;
  sale.voidChannel = by.channel;
  sale.voidRefund = refund;
  return sale;
}
