import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { ProductSales } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const PATH =
  "/owner/laporan/paling-laku?periode=bulan&dari=2026-11-01&sampai=2026-11-30";

const row = (over: Partial<ProductSales>): ProductSales => ({
  productId: "p",
  productName: "?",
  unitName: "pcs",
  unitSize: 1,
  isCurah: false,
  qtyBase: 1,
  revenue: 0,
  grossProfit: 0,
  ...over,
});
const BERAS = row({
  productId: "beras",
  productName: "Beras Premium 5 kg",
  unitName: "karung",
  qtyBase: 142,
  revenue: 9_230_000,
  grossProfit: 1_100_000,
});
const MINYAK = row({
  productId: "minyak",
  productName: "Minyak Goreng 1 L",
  unitName: "pcs",
  qtyBase: 310,
  revenue: 5_270_000,
  grossProfit: null,
});
const GULA = row({
  productId: "gula",
  productName: "Gula Pasir",
  unitName: "kg",
  unitSize: 1000,
  isCurah: true,
  qtyBase: 288_000,
  revenue: 4_032_000,
  grossProfit: 400_000,
});
const ORDER = {
  omzet: [BERAS, MINYAK, GULA],
  jumlah: [MINYAK, GULA, BERAS],
  laba: [BERAS, GULA, MINYAK],
};

const requests: string[] = [];

beforeEach(async () => {
  requests.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 5, 7, 30));
  server.use(
    http.get("*/api/owner/reports/products", ({ request }) => {
      const params = new URL(request.url).searchParams;
      const sort = params.get("sort") ?? "omzet";
      requests.push(`${params.get("period")} ${sort}`);
      return HttpResponse.json(ORDER[sort as keyof typeof ORDER]);
    }),
  );
  await ownerLogin();
});
afterEach(() => vi.useRealTimers());

const items = () =>
  within(screen.getByRole("main"))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

test("Omzet terpilih; urutan dan angka dari server, peringkat 1..n", async () => {
  renderApp(PATH);
  expect(
    await screen.findByRole("heading", { level: 1, name: "Paling laku" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Beras Premium 5 kg")).toBeInTheDocument();
  expect(screen.getByText("1–5 Nov")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Omzet" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(requests).toEqual(["bulan omzet"]);
  expect(items()).toEqual([
    "1Beras Premium 5 kg142 karungRp9.230.000",
    "2Minyak Goreng 1 L310 pcsRp5.270.000",
    "3Gula Pasir288 kgRp4.032.000",
  ]);
});

test("Jumlah: request sort=jumlah; kanan jumlah dengan omzet di bawah; Minyak, Gula, Beras", async () => {
  renderApp(PATH);
  await screen.findByText("Beras Premium 5 kg");
  await userEvent.click(screen.getByRole("button", { name: "Jumlah" }));
  await vi.waitFor(() => expect(items()[0]).toMatch(/^1Minyak/));
  expect(requests).toEqual(["bulan omzet", "bulan jumlah"]);
  expect(items()).toEqual([
    "1Minyak Goreng 1 L310 pcsRp5.270.000",
    "2Gula Pasir288 kgRp4.032.000",
    "3Beras Premium 5 kg142 karungRp9.230.000",
  ]);
});

test("Laba: urutan server, HPP belum ada di akhir", async () => {
  renderApp(PATH);
  await screen.findByText("Beras Premium 5 kg");
  await userEvent.click(screen.getByRole("button", { name: "Laba" }));
  await screen.findByText("HPP belum ada");
  expect(requests).toEqual(["bulan omzet", "bulan laba"]);
  expect(items()).toEqual([
    "1Beras Premium 5 kg142 karungRp1.100.000",
    "2Gula Pasir288 kgRp400.000",
    "3Minyak Goreng 1 L310 pcsHPP belum ada",
  ]);
});

test("‹ Laporan mempertahankan periode di URL", async () => {
  renderApp("/owner/laporan?periode=minggu&dari=2026-11-02&sampai=2026-11-08");
  await userEvent.click(
    await screen.findByRole("link", { name: "Lihat semua" }),
  );
  expect(await screen.findByText("2–5 Nov")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Laporan" }));
  expect(await screen.findByRole("button", { name: "Minggu" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("kosong → Belum ada penjualan", async () => {
  server.use(
    http.get("*/api/owner/reports/products", () => HttpResponse.json([])),
  );
  renderApp(PATH);
  expect(await screen.findByText("Belum ada penjualan")).toBeInTheDocument();
});

test("galat → pesanError dan Coba lagi", async () => {
  server.use(
    http.get("*/api/owner/reports/products", () =>
      HttpResponse.json({ code: "INTERNAL", message: "x" }, { status: 500 }),
    ),
  );
  renderApp(PATH);
  expect(
    await screen.findByRole("button", { name: "Coba lagi" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Segera hadir")).not.toBeInTheDocument();
});

test("(fix final 4) muat ulang gagal saat daftar tampil → peringatan + Coba lagi, daftar lama tetap", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp(PATH);
  expect(await screen.findByText("Beras Premium 5 kg")).toBeInTheDocument();
  server.use(
    http.get("*/api/owner/reports/products", () => HttpResponse.error(), {
      once: true,
    }),
  );
  await queryClient.refetchQueries({
    queryKey: ["/api/owner/reports/products"],
  });
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Server tidak tersambung — coba lagi");
  expect(screen.getByText("Beras Premium 5 kg")).toBeInTheDocument();
  await user.click(within(alert).getByRole("button", { name: "Coba lagi" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
