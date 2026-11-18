import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { SalesReport } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const PATH =
  "/owner/laporan/kategori?periode=bulan&dari=2026-11-01&sampai=2026-11-30";

const totals = {
  revenue: 0,
  grossProfit: 0,
  salesCount: 0,
  avgTicket: 0,
  newCredit: 0,
  marginPermille: null,
};
const report = (over: Partial<SalesReport>): SalesReport => ({
  period: "bulan",
  range: { from: "2026-11-01", to: "2026-11-05" },
  previous: { from: "2026-10-01", to: "2026-10-05" },
  running: true,
  current: totals,
  previousTotals: totals,
  series: { kind: "hari", buckets: [] },
  topProducts: [],
  categories: [],
  kasir: [],
  ...over,
});
const serve = (body: SalesReport) =>
  server.use(
    http.get("*/api/owner/reports/sales", () => HttpResponse.json(body)),
  );

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 5, 7, 30));
  await ownerLogin();
});
afterEach(() => vi.useRealTimers());

test("urutan server, Tanpa kategori, barang dan laba", async () => {
  serve(
    report({
      categories: [
        {
          category: "Beras",
          revenue: 20_000_000,
          grossProfit: 2_500_000,
          productCount: 12,
        },
        {
          category: "Minyak",
          revenue: 9_500_000,
          grossProfit: 1_200_000,
          productCount: 4,
        },
        { category: null, revenue: 1_250_000, grossProfit: 0, productCount: 1 },
      ],
    }),
  );
  renderApp(PATH);
  expect(
    await screen.findByRole("heading", { level: 1, name: "Per kategori" }),
  ).toBeInTheDocument();
  await screen.findByText("Beras");
  expect(screen.getByText("1–5 Nov")).toBeInTheDocument();
  expect(
    within(screen.getByRole("main"))
      .getAllByRole("listitem")
      .map((li) => li.textContent),
  ).toEqual([
    "Beras12 barang · laba Rp2.500.000Rp20.000.000",
    "Minyak4 barang · laba Rp1.200.000Rp9.500.000",
    "Tanpa kategori1 barang · laba Rp0Rp1.250.000",
  ]);
});

test("kosong → Belum ada penjualan", async () => {
  serve(report({}));
  renderApp(PATH);
  expect(await screen.findByText("Belum ada penjualan")).toBeInTheDocument();
});

test("galat → pesan dan Coba lagi", async () => {
  server.use(
    http.get("*/api/owner/reports/sales", () =>
      HttpResponse.json({ code: "INTERNAL", message: "x" }, { status: 500 }),
    ),
  );
  renderApp(PATH);
  expect(
    await screen.findByRole("button", { name: "Coba lagi" }),
  ).toBeInTheDocument();
});
