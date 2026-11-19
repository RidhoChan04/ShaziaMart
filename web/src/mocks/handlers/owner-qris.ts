import type { HttpHandler } from "msw";

/** QRIS harian pemilik: total per hari, tanda pencocokan, rincian transaksi (S7, S11). */
export const ownerQrisHandlers: HttpHandler[] = [];
