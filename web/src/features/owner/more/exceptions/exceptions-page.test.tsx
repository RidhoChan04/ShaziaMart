import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  cashSale,
  customerId,
  loginWithShift,
  ownerLogin,
  post,
} from "@/mocks/handlers/test-helpers";
import { getGetOwnerTodaySummaryQueryKey } from "@/shared/api/gen/owner/owner";
import { renderApp } from "@/test/render-app";
import {
  EXC_NOW,
  gulaBody,
  kasirVoid,
  mixedBody,
  nextShift,
  sell,
} from "@/test/seed-exceptions";

const VOID_PAGE = "/owner/pengecualian/batal_transaksi";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EXC_NOW);
  await loginWithShift();
});

afterEach(() => vi.useRealTimers());

const rowOf = (text: RegExp) => {
  const li = screen.getByText(text).closest("li");
  if (!li) throw new Error("baris tidak ada");
  return li;
};

test("batal transaksi: eyebrow 'Belum pernah ditinjau', judul, baris '{nomor} · Rina' / alasan / 'Rp36.000' / 'Hari ini 14.00'; kembali ke Beranda", async () => {
  const sale = await sell(cashSale());
  await kasirVoid(sale, "Salah scan barang");
  await ownerLogin();
  renderApp(VOID_PAGE);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Transaksi dibatalkan kasir",
    }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Belum pernah ditinjau")).toBeInTheDocument();
  const row = rowOf(new RegExp(`${sale.number} · Rina`));
  const r = within(row);
  expect(r.getByText("Salah scan barang")).toBeInTheDocument();
  expect(r.getByText("Rp36.000")).toBeInTheDocument();
  expect(r.getByText("Hari ini 14.00")).toBeInTheDocument();
  expect(
    within(screen.getByRole("main")).getByRole("link", { name: /Beranda/ }),
  ).toHaveAttribute("href", "/owner");
  expect(
    screen.getByRole("button", { name: "Tandai sudah ditinjau" }),
  ).toBeEnabled();
});

test("(ruling R12) void shift lama: 'Shift sebelumnya · tunai dari laci Rp30.000'; QRIS ke pemilik nanti = tugas 'Transfer Rp20.000 ke Bu Sari (pengembalian QRIS struk …)'", async () => {
  const sale = await sell(mixedBody("Bu Sari"));
  await nextShift();
  await kasirVoid(sale, "Barang rusak", "pemilik");
  await ownerLogin();
  renderApp(VOID_PAGE);
  await screen.findByText("Barang rusak");
  const r = within(rowOf(/Barang rusak/));
  expect(
    r.getByText("Shift sebelumnya · tunai dari laci Rp30.000"),
  ).toBeInTheDocument();
  expect(
    r.getByText(
      `Transfer Rp20.000 ke Bu Sari (pengembalian QRIS struk ${sale.number})`,
    ),
  ).toBeInTheDocument();
});

test("transaksi tanpa pelanggan: 'Transfer Rp20.000 ke pembeli (pengembalian QRIS struk …)'", async () => {
  const sale = await sell(mixedBody(null));
  await nextShift();
  await kasirVoid(sale, "Salah harga", "pemilik");
  await ownerLogin();
  renderApp(VOID_PAGE);
  await screen.findByText("Salah harga");
  expect(
    screen.getByText(
      `Transfer Rp20.000 ke pembeli (pengembalian QRIS struk ${sale.number})`,
    ),
  ).toBeInTheDocument();
});

test("void shift ini dengan QRIS 'laci': 'QRIS dikembalikan tunai dari laci Rp20.000', tanpa tugas transfer", async () => {
  const sale = await sell(gulaBody([{ method: "qris", amount: 20_000 }]));
  await kasirVoid(sale, "Pelanggan batal", "laci");
  await ownerLogin();
  renderApp(VOID_PAGE);
  await screen.findByText("Pelanggan batal");
  const r = within(rowOf(/Pelanggan batal/));
  expect(
    r.getByText("QRIS dikembalikan tunai dari laci Rp20.000"),
  ).toBeInTheDocument();
  expect(r.queryByText(/^Transfer /)).toBeNull();
  expect(r.queryByText(/Shift sebelumnya/)).toBeNull();
});

test("batal pelunasan dan kasbon lewat limit: baris '{pelanggan} · Rina' dengan nominal masing-masing", async () => {
  const bySari = customerId("Bu Sari");
  expect(
    (
      await post("/api/credit-payments", {
        id: "pel-1",
        customerId: bySari,
        amount: 50_000,
        method: "tunai",
        cashReceived: 100_000,
        print: false,
      })
    ).status,
  ).toBe(201);
  await post("/api/credit-payments/pel-1/cancel", {
    reason: "Salah pelanggan",
  });
  const over = await post(
    "/api/sales",
    gulaBody([{ method: "credit", amount: 450_000 }], {
      customerId: bySari,
      creditLimitReason: "Anak sakit",
    }),
  );
  expect(over.status).toBe(201);
  await ownerLogin();

  const repay = renderApp("/owner/pengecualian/batal_pelunasan");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Pelunasan dibatalkan kasir",
    }),
  ).toBeInTheDocument();
  await screen.findByText(/Bu Sari · Rina/);
  const a = within(rowOf(/Bu Sari · Rina/));
  expect(a.getByText("Salah pelanggan")).toBeInTheDocument();
  expect(a.getByText("Rp50.000")).toBeInTheDocument();
  repay.unmount();

  renderApp("/owner/pengecualian/kasbon_lewat_limit");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Kasbon lewat limit",
    }),
  ).toBeInTheDocument();
  await screen.findByText(/Bu Sari · Rina/);
  const b = within(rowOf(/Bu Sari · Rina/));
  expect(b.getByText("Anak sakit")).toBeInTheDocument();
  expect(b.getByText(/^Rp\d/)).toBeInTheDocument();
});

test("'Tandai sudah ditinjau' mengirim upTo = jam kejadian terbaru yang tampil (bukan jam klik); toast; daftar kosong; eyebrow 'Sejak ditinjau'; ringkasan Beranda dimuat ulang", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const sale = await sell(cashSale());
  await kasirVoid(sale, "Salah scan");
  await ownerLogin();
  const { queryClient } = renderApp(VOID_PAGE);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  await screen.findByText("Salah scan");
  // Jam klik jauh lebih lambat dari kejadian terbaru.
  vi.setSystemTime(EXC_NOW + 3_600_000);
  await user.click(
    screen.getByRole("button", { name: "Tandai sudah ditinjau" }),
  );
  expect(
    await screen.findByText("Tidak ada yang perlu ditinjau"),
  ).toBeInTheDocument();
  expect(mockDb.get().exceptionReviews.batal_transaksi).toBe(EXC_NOW);
  expect(
    await screen.findByText("Ditandai sudah ditinjau"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Sejak ditinjau 5 Nov 2026 14.00"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Tandai sudah ditinjau" }),
  ).toBeNull();
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: getGetOwnerTodaySummaryQueryKey(),
  });
  // Tombol hilang: fokus pindah ke judul halaman, bukan lenyap ke body.
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
});

test("kejadian yang masuk setelah daftar dimuat tidak ikut ditandai: tetap di daftar dan di butir Beranda", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const first = await sell(cashSale());
  await kasirVoid(first, "Pertama");
  await ownerLogin();
  renderApp(VOID_PAGE);
  await screen.findByText("Pertama");
  // Kejadian kedua terjadi sesudah daftar dimuat.
  vi.setSystemTime(EXC_NOW + 600_000);
  const second = await sell(cashSale());
  await kasirVoid(second, "Kedua");
  await user.click(
    screen.getByRole("button", { name: "Tandai sudah ditinjau" }),
  );
  await waitFor(() =>
    expect(mockDb.get().exceptionReviews.batal_transaksi).toBe(EXC_NOW),
  );
  expect(await screen.findByText("Kedua")).toBeInTheDocument();
  expect(screen.queryByText("Pertama")).toBeNull();
  const res = await fetch("/api/owner/summary/today");
  const body = (await res.json()) as {
    attention: { exceptions: { kind: string; count: number }[] };
  };
  expect(body.attention.exceptions).toEqual([
    expect.objectContaining({ kind: "batal_transaksi", count: 1 }),
  ]);
});

test("tanpa kejadian: 'Tidak ada yang perlu ditinjau' dan tanpa tombol", async () => {
  await ownerLogin();
  renderApp(VOID_PAGE);
  expect(
    await screen.findByText("Tidak ada yang perlu ditinjau"),
  ).toBeInTheDocument();
  expect(screen.getByText("Belum pernah ditinjau")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Tandai sudah ditinjau" }),
  ).toBeNull();
});

test("jenis tidak dikenal: 'Halaman tidak ditemukan' dengan tautan ke Beranda", async () => {
  await ownerLogin();
  renderApp("/owner/pengecualian/lainnya");
  expect(
    await screen.findByText("Halaman tidak ditemukan"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Kembali ke Beranda" }),
  ).toHaveAttribute("href", "/owner");
});

test("(fix final 10) batal transaksi yang kasbonnya lewat limit → tanda oranye 'Lewat limit Rp70.000' (ikon + teks); transaksi lain tanpa tanda; butir kasbon lewat limit hilang", async () => {
  const over = await sell(
    gulaBody([{ method: "credit", amount: 450_000 }], {
      customerId: customerId("Bu Sari"),
      creditLimitReason: "Anak sakit",
    }),
  );
  await kasirVoid(over, "Salah pelanggan");
  const plain = await sell(cashSale());
  await kasirVoid(plain, "Salah scan");
  await ownerLogin();
  const { unmount } = renderApp(VOID_PAGE);
  await screen.findByText("Salah pelanggan");
  const withLimit = within(rowOf(/Salah pelanggan/));
  const badge = withLimit.getByText("Lewat limit Rp70.000");
  expect(badge).toHaveClass("bg-warning-soft", "text-warning-ink");
  expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(
    within(rowOf(/Salah scan/)).queryByText(/Lewat limit/),
  ).not.toBeInTheDocument();
  unmount();

  renderApp("/owner/pengecualian/kasbon_lewat_limit");
  expect(
    await screen.findByText("Tidak ada yang perlu ditinjau"),
  ).toBeInTheDocument();
});
