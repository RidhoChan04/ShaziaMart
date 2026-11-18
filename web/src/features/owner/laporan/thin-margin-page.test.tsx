import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  StockReport,
  ThinMarginItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const PATH =
  "/owner/laporan/untung-tipis?periode=bulan&dari=2026-11-01&sampai=2026-11-30";

const item = (over: Partial<ThinMarginItem>): ThinMarginItem => ({
  productId: "p",
  productName: "Barang",
  unitName: "pcs",
  price: 10_000,
  unitCost: 9_170,
  marginPermille: 83,
  ...over,
});

const serve = (items: ThinMarginItem[]) =>
  server.use(
    http.get("*/api/owner/reports/stock", () =>
      HttpResponse.json({
        today: "2026-11-05",
        unsold: {
          minDays: 30,
          count: 0,
          heldValue: 0,
          noCostCount: 0,
          items: [],
        },
        thinMargin: { thresholdPermille: 100, count: items.length, items },
      } satisfies StockReport),
    ),
  );

beforeEach(async () => {
  await ownerLogin();
});

test("lead, urutan server (rugi dulu), tanda Rugi danger dan warn", async () => {
  serve([
    item({
      productId: "r",
      productName: "Gula Rugi",
      price: 14_000,
      unitCost: 14_300,
      marginPermille: -21,
    }),
    item({
      productId: "z",
      productName: "Garam Nol",
      price: 5_000,
      unitCost: 5_000,
      marginPermille: 0,
    }),
    item({ productId: "w", productName: "Susu Tipis" }),
  ]);
  renderApp(PATH);
  expect(
    await screen.findByText("Margin di bawah 10% dari harga eceran"),
  ).toBeInTheDocument();
  const rows = within(screen.getByRole("main")).getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Gula Rugi");
  expect(rows[0]).toHaveTextContent("Modal Rp14.300 · harga Rp14.000 per pcs");
  expect(rows[0]).toHaveTextContent("Rugi");
  expect(rows[0]).toHaveTextContent("−2,1%");
  const rugi = rows[0]?.querySelector("[data-tone]");
  expect(rugi).toHaveAttribute("data-tone", "danger");
  expect(rugi?.className).toMatch(/bg-danger-soft/);
  expect(rugi?.className).toMatch(/text-danger-ink/);
  expect(rugi?.querySelector("svg")).not.toBeNull();
  expect(rows[1]).toHaveTextContent("Garam Nol");
  expect(rows[1]).toHaveTextContent("0,0%");
  expect(rows[1]).not.toHaveTextContent("Rugi");
  expect(rows[1]?.querySelector("[data-tone]")).toHaveAttribute(
    "data-tone",
    "warn",
  );
  expect(rows[2]).toHaveTextContent("Modal Rp9.170 · harga Rp10.000 per pcs");
  expect(rows[2]).toHaveTextContent("8,3%");
  const warn = rows[2]?.querySelector("[data-tone]");
  expect(warn).toHaveAttribute("data-tone", "warn");
  expect(warn?.className).toMatch(/bg-warning-soft/);
  expect(warn?.querySelector("svg")).not.toBeNull();
});

test("kosong", async () => {
  serve([]);
  renderApp(PATH);
  expect(
    await screen.findByText("Tidak ada barang dengan untung tipis"),
  ).toBeInTheDocument();
});

test("galat memuat", async () => {
  server.use(
    http.get("*/api/owner/reports/stock", () =>
      HttpResponse.json(
        { status: 500, title: "x", code: "INTERNAL" },
        { status: 500 },
      ),
    ),
  );
  renderApp(PATH);
  expect(
    await screen.findByRole("button", { name: "Coba lagi" }),
  ).toBeInTheDocument();
});
