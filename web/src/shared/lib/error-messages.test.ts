import { expect, test } from "vitest";
import { ApiError } from "../api/fetcher";
import { pesanError } from "./error-messages";

test.each([
  ["NETWORK", "Server tidak tersambung — coba lagi"],
  ["UNAUTHORIZED", "Sesi berakhir — masukkan PIN lagi"],
  ["PIN_INVALID", "PIN salah"],
  ["PIN_REQUIRED", "Butuh PIN pemilik"],
  ["LOCKED_OUT", "Terlalu banyak PIN salah — coba lagi dalam 5 menit"],
  ["SHIFT_CLOSED", "Shift belum dibuka"],
  ["SHIFT_ALREADY_OPEN", "Shift sudah dibuka"],
  ["PRICE_CHANGED", "Harga berubah — periksa lalu konfirmasi"],
  ["CREDIT_LIMIT", "Kasbon melebihi limit pelanggan"],
  ["INVALID_QUANTITY", "Jumlah tidak valid"],
  ["NOT_FOUND", "Data tidak ditemukan"],
  ["INTERNAL", "Terjadi kesalahan di server"],
] as const)("pesanError(%s)", (code, msg) =>
  expect(pesanError(new ApiError({ status: 0, code }))).toBe(msg),
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
