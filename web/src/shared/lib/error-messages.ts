import { ApiError } from "../api/fetcher";

/** Pesan 409 ID_TAKEN; draf yang ditolak karenanya ditawari kirim sebagai nota baru. */
export const ID_TAKEN_MESSAGE = "Data ini milik pengguna lain";

/** 409 PRODUCT_HAS_SALES: barang pernah terjual. */
export const PRODUCT_HAS_SALES_MESSAGE =
  "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.";

/** 409 PRODUCT_HAS_SALES untuk barang yang ada di nota barang masuk aktif (R32). */
export const PRODUCT_HAS_RECEIPTS_MESSAGE =
  "Barang ini sudah ada di barang masuk — pakai Nonaktif";

const GENERIC = "Terjadi kesalahan di server";

const MESSAGES: Record<string, string> = {
  NETWORK: "Server tidak tersambung — coba lagi",
  UNAUTHORIZED: "Sesi berakhir — masukkan PIN lagi",
  PIN_INVALID: "PIN salah",
  PIN_REQUIRED: "Butuh PIN pemilik",
  LOGIN_INVALID: "Nama atau password salah",
  LOCKED_OUT: "Terlalu banyak PIN salah — coba lagi dalam 5 menit",
  SHIFT_CLOSED: "Shift belum dibuka",
  SHIFT_ALREADY_OPEN: "Shift sudah dibuka",
  PRICE_CHANGED: "Harga berubah — periksa lalu konfirmasi",
  CREDIT_LIMIT: "Kasbon melebihi limit pelanggan",
  INVALID_QUANTITY: "Jumlah tidak valid",
  NOT_FOUND: "Data tidak ditemukan",
  PRODUCT_INACTIVE: "Barang ini tidak dijual lagi",
  PRODUCT_HAS_SALES: PRODUCT_HAS_SALES_MESSAGE,
  STAFF_LAN_ONLY: "Hanya bisa dipakai di Wi-Fi toko",
  PRODUCT_NO_PRICE: "Barang belum punya harga jual",
  RECEIPT_CANCELLED: "Nota ini sudah dibatalkan",
  DEBT_ALREADY_PAID: "Utang ini sudah lunas",
  ID_TAKEN: ID_TAKEN_MESSAGE,
  INTERNAL: GENERIC,
};

/** Pesan Bahasa Indonesia untuk kasir & pemilik; hanya membaca `code` dan `detail`. */
export function pesanError(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.code === "VALIDATION") return error.detail ?? "Data tidak valid";
  return MESSAGES[error.code] ?? GENERIC;
}

/** Galat pembayaran: SHIFT_CLOSED menampilkan kalimat server (menyebut sumber uang lain); selebihnya `pesanError`. */
export function pesanPembayaran(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.code === "SHIFT_CLOSED" &&
    error.detail
  ) {
    return error.detail;
  }
  return pesanError(error);
}

/** Galat hapus barang: 409 PRODUCT_HAS_SALES menampilkan alasan dari server (terjual atau ada barang masuk); selebihnya `pesanError`. */
export function pesanHapusBarang(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.code === "PRODUCT_HAS_SALES" &&
    error.detail
  ) {
    return error.detail;
  }
  return pesanError(error);
}
