import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  StockReport,
  UnsoldItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const PATH =
  "/owner/laporan/tidak-terjual?periode=bulan&dari=2026-11-01&sampai=2026-11-30";

const item = (over: Partial<UnsoldItem>): UnsoldItem => ({
  productId: "p1",
  productName: "Beras Premium 5 kg",
  unitName: "pcs",
  unitSize: 1,
  isCurah: false,
  stockQtyBase: 18,
  lastSoldAt: 1,
  sinceDate: "2026-08-23",
  days: 74,
  heldValue: 1_650_000,
  ...over,
});

const stock = (
  items: UnsoldItem[],
  over: Partial<StockReport["unsold"]> = {},
) =>
  ({
    today: "2026-11-05",
    unsold: {
      minDays: 30,
      count: items.length,
      heldValue: 3_412_000,
      noCostCount: 2,
      items,
      ...over,
    },
    thinMargin: { thresholdPermille: 100, count: 0, items: [] },
  }) satisfies StockReport;

const requests: Array<string | null> = [];

function serve(bySort: Record<string, StockReport>) {
  requests.length = 0;
  server.use(
    http.get("*/api/owner/reports/stock", ({ request }) => {
      const sort = new URL(request.url).searchParams.get("sort");
      requests.push(sort);
      return HttpResponse.json(bySort[sort ?? "modal"]);
    }),
  );
}

beforeEach(async () => {
  await ownerLogin();
});

test("kartu, baris urutan server, dan tanda HPP belum ada", async () => {
  serve({
    modal: stock([
      item({}),
      item({
        productId: "p2",
        productName: "Minyak Curah",
        lastSoldAt: null,
        days: 52,
        heldValue: null,
        stockQtyBase: 2500,
        unitSize: 1000,
        unitName: "L",
      }),
    ]),
  });
  renderApp(PATH);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Tidak terjual ≥ 30 hari",
    }),
  ).toBeInTheDocument();
  const card = (await screen.findByText("Modal tertahan"))
    .parentElement as HTMLElement;
  expect(card).toHaveTextContent("Rp3.412.000");
  expect(card).toHaveTextContent("2 barang");
  expect(card).toHaveTextContent("2 barang belum ada HPP");
  const rows = within(screen.getByRole("main")).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(
    within(rows[0] as HTMLElement).getByText("Beras Premium 5 kg"),
  ).toBeInTheDocument();
  expect(rows[0]).toHaveTextContent("74 hari · stok 18 pcs");
  expect(rows[0]).toHaveTextContent("Rp1.650.000");
  expect(rows[1]).toHaveTextContent("Minyak Curah");
  expect(rows[1]).toHaveTextContent("belum terjual · 52 hari");
  expect(rows[1]).toHaveTextContent("HPP belum ada");
  expect(requests).toEqual(["modal"]);
});

test("Paling lama meminta sort=lama dan menampilkan urutan server apa adanya", async () => {
  const a = item({
    productId: "a",
    productName: "Barang A",
    days: 40,
    heldValue: 9_000_000,
  });
  const b = item({
    productId: "b",
    productName: "Barang B",
    days: 90,
    heldValue: 1_000,
  });
  serve({ modal: stock([a, b]), lama: stock([b, a]) });
  renderApp(PATH);
  await screen.findByText("Barang A");
  const seg = screen.getByRole("group", { name: "Urutan" });
  expect(
    within(seg).getByRole("button", { name: "Modal terbesar" }),
  ).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(
    within(seg).getByRole("button", { name: "Paling lama" }),
  );
  await screen.findByText("Barang B");
  expect(
    within(seg).getByRole("button", { name: "Paling lama" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(requests).toEqual(["modal", "lama"]);
  const names = within(screen.getByRole("main"))
    .getAllByRole("listitem")
    .map((r) => /Barang [AB]/.exec(r.textContent ?? "")?.[0]);
  expect(names).toEqual(["Barang B", "Barang A"]);
});

test("tanpa barang belum ber-HPP: tidak ada tanda; kosong dan galat", async () => {
  serve({ modal: stock([], { count: 0, heldValue: 0, noCostCount: 0 }) });
  renderApp(PATH);
  expect(
    await screen.findByText("Tidak ada barang yang lama tidak terjual"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/belum ada HPP/)).not.toBeInTheDocument();
});

test("galat memuat: pesan dan Coba lagi", async () => {
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
