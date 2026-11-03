import { expect, test } from "vitest";
import { ApiError } from "../api/fetcher";
import {
  pesanError,
  pesanHapusBarang,
  pesanPembayaran,
} from "./error-messages";

test.each([
  ["NETWORK", "Server tidak tersambung — coba lagi"],
  ["UNAUTHORIZED", "Sesi berakhir — masukkan PIN lagi"],
  ["PIN_INVALID", "PIN salah"],
  ["PIN_REQUIRED", "Butuh PIN pemilik"],
  ["LOGIN_INVALID", "Nama atau password salah"],
  ["LOCKED_OUT", "Terlalu banyak PIN salah — coba lagi dalam 5 menit"],
  ["SHIFT_CLOSED", "Shift belum dibuka"],
  ["SHIFT_ALREADY_OPEN", "Shift sudah dibuka"],
  ["PRICE_CHANGED", "Harga berubah — periksa lalu konfirmasi"],
  ["CREDIT_LIMIT", "Kasbon melebihi limit pelanggan"],
  ["INVALID_QUANTITY", "Jumlah tidak valid"],
  ["NOT_FOUND", "Data tidak ditemukan"],
  ["PRODUCT_INACTIVE", "Barang ini tidak dijual lagi"],
  [
    "PRODUCT_HAS_SALES",
    "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
  ],
  ["INTERNAL", "Terjadi kesalahan di server"],
] as const)("pesanError(%s)", (code, msg) =>
  expect(pesanError(new ApiError({ status: 0, code }))).toBe(msg),
);

test.each([
  ["STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"],
  ["PRODUCT_NO_PRICE", "Barang belum punya harga jual"],
  ["RECEIPT_CANCELLED", "Nota ini sudah dibatalkan"],
  ["DEBT_ALREADY_PAID", "Utang ini sudah lunas"],
  ["ID_TAKEN", "Data ini milik pengguna lain"],
] as const)("pesanError %s", (code, text) =>
  expect(pesanError(new ApiError({ status: 403, code }))).toBe(text),
);

test("VALIDATION memakai detail bila ada", () =>
  expect(
    pesanError(
      new ApiError({
        status: 422,
        code: "VALIDATION",
        detail: "Pelanggan wajib dipilih",
      }),
    ),
  ).toBe("Pelanggan wajib dipilih"));
test("VALIDATION tanpa detail", () =>
  expect(pesanError(new ApiError({ status: 422, code: "VALIDATION" }))).toBe(
    "Data tidak valid",
  ));
test("error non-ApiError → pesan umum", () =>
  expect(pesanError(new Error("x"))).toBe("Terjadi kesalahan di server"));

test("pesanPembayaran: SHIFT_CLOSED memakai kalimat server (sumber uang harus dipilih ulang)", () => {
  const detail =
    "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer";
  expect(
    pesanPembayaran(
      new ApiError({ status: 409, code: "SHIFT_CLOSED", detail }),
    ),
  ).toBe(detail);
  expect(
    pesanPembayaran(new ApiError({ status: 409, code: "SHIFT_CLOSED" })),
  ).toBe("Shift belum dibuka");
});
test("pesanPembayaran: galat lain sama dengan pesanError", () =>
  expect(
    pesanPembayaran(new ApiError({ status: 409, code: "DEBT_ALREADY_PAID" })),
  ).toBe("Utang ini sudah lunas"));

test("pesanHapusBarang: PRODUCT_HAS_SALES memakai alasan server (barang masuk, R32); tanpa detail / galat lain = pesanError", () => {
  const detail = "Barang ini sudah ada di barang masuk — pakai Nonaktif";
  expect(
    pesanHapusBarang(
      new ApiError({ status: 409, code: "PRODUCT_HAS_SALES", detail }),
    ),
  ).toBe(detail);
  expect(
    pesanHapusBarang(new ApiError({ status: 409, code: "PRODUCT_HAS_SALES" })),
  ).toBe(
    "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
  );
  expect(pesanHapusBarang(new ApiError({ status: 0, code: "NETWORK" }))).toBe(
    "Server tidak tersambung — coba lagi",
  );
});
