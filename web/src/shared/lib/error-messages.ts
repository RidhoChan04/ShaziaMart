import { ApiError } from "../api/fetcher";

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
  PRODUCT_HAS_SALES:
    "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
  STAFF_LAN_ONLY: "Hanya bisa dipakai di Wi-Fi toko",
  PRODUCT_NO_PRICE: "Barang belum punya harga jual",
  RECEIPT_CANCELLED: "Nota ini sudah dibatalkan",
  DEBT_ALREADY_PAID: "Utang ini sudah lunas",
  ID_TAKEN: "Data ini milik pengguna lain",
  INTERNAL: GENERIC,
};

/** Pesan Bahasa Indonesia untuk kasir & pemilik; hanya membaca `code` dan `detail`. */
export function pesanError(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.code === "VALIDATION") return error.detail ?? "Data tidak valid";
  return MESSAGES[error.code] ?? GENERIC;
}
