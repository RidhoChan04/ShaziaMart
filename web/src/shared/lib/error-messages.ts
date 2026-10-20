import { ApiError } from "../api/fetcher";

const GENERIC = "Terjadi kesalahan di server";

const MESSAGES: Record<string, string> = {
  NETWORK: "Server tidak tersambung — coba lagi",
  UNAUTHORIZED: "Sesi berakhir — masukkan PIN lagi",
  PIN_INVALID: "PIN salah",
  PIN_REQUIRED: "Butuh PIN pemilik",
  LOCKED_OUT: "Terlalu banyak PIN salah — coba lagi dalam 5 menit",
  SHIFT_CLOSED: "Shift belum dibuka",
  SHIFT_ALREADY_OPEN: "Shift sudah dibuka",
  PRICE_CHANGED: "Harga berubah — periksa lalu konfirmasi",
  CREDIT_LIMIT: "Kasbon melebihi limit pelanggan",
  INVALID_QUANTITY: "Jumlah tidak valid",
  NOT_FOUND: "Data tidak ditemukan",
  INTERNAL: GENERIC,
};

/** Pesan Bahasa Indonesia untuk kasir; hanya membaca `code` dan `detail`. */
export function pesanError(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.code === "VALIDATION") return error.detail ?? "Data tidak valid";
  return MESSAGES[error.code] ?? GENERIC;
}
