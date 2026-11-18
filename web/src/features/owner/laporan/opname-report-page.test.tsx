import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  OpnameReport,
  OpnameReportItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const PATH =
  "/owner/laporan/selisih-opname?periode=bulan&dari=2026-11-01&sampai=2026-11-30";

const item = (over: Partial<OpnameReportItem>): OpnameReportItem => ({
  productId: "p1",
  productName: "Rokok Gudang Garam 12",
  unitName: "bks",
  unitSize: 1,
  isCurah: false,
  countTotal: 4,
  shortCount: 3,
  overCount: 0,
  repeated: true,
  shortQtyBase: 14,
  overQtyBase: 0,
  lossValue: 294_000,
  gainValue: 0,
  ...over,
});

const report = (
  items: OpnameReportItem[],
  over: Partial<OpnameReport> = {},
): OpnameReport => ({
  range: { from: "2026-11-01", to: "2026-11-05" },
  lossValue: 412_000,
  lossCount: 9,
  gainValue: 38_000,
  gainCount: 1,
  unknownValueCount: 0,
  items,
  ...over,
});

const serve = (body: OpnameReport) =>
  server.use(
    http.get("*/api/owner/reports/opname", () => HttpResponse.json(body)),
  );

beforeEach(async () => {
  await ownerLogin();
});

test("kartu, baris urutan server, Berulang, kurang/lebih, HPP belum ada, catatan", async () => {
  serve(
    report(
      [
        item({}),
        item({
          productId: "p2",
          productName: "Kecap ABC 600 ml",
          unitName: "pcs",
          countTotal: 2,
          shortCount: 1,
          repeated: false,
          shortQtyBase: 2,
          lossValue: 38_000,
        }),
        item({
          productId: "p3",
          productName: "Telur",
          unitName: "kg",
          unitSize: 1000,
          countTotal: 2,
          shortCount: 0,
          overCount: 1,
          repeated: false,
          shortQtyBase: 0,
          overQtyBase: 500,
          lossValue: 0,
          gainValue: 38_000,
        }),
        item({
          productId: "p4",
          productName: "Tanpa Modal",
          countTotal: 1,
          shortCount: 1,
          repeated: false,
          shortQtyBase: 1,
          lossValue: null,
        }),
      ],
      { unknownValueCount: 2 },
    ),
  );
  renderApp(PATH);
  expect(
    await screen.findByRole("heading", { level: 1, name: "Selisih opname" }),
  ).toBeInTheDocument();
  expect(screen.getByText("1–30 Nov")).toBeInTheDocument();
  const cards = await screen.findByLabelText("Ringkasan selisih");
  expect(cards).toHaveTextContent("Kurang−Rp412.000");
  expect(cards).toHaveTextContent("9 barang");
  expect(cards).toHaveTextContent("Lebih+Rp38.000");
  expect(cards).toHaveTextContent("1 barang");
  expect(
    screen.getByRole("heading", { name: "Per barang" }),
  ).toBeInTheDocument();
  const rows = within(screen.getByRole("main")).getAllByRole("listitem");
  expect(rows).toHaveLength(4);
  expect(rows[0]).toHaveTextContent("Rokok Gudang Garam 12");
  expect(rows[0]).toHaveTextContent("Berulang");
  expect(rows[0]).toHaveTextContent("3 dari 4");
  expect(rows[0]).toHaveTextContent("−Rp294.000");
  expect(rows[1]).toHaveTextContent("kurang di 1 dari 2 · −2 pcs");
  expect(rows[1]).not.toHaveTextContent("Berulang");
  expect(rows[1]).toHaveTextContent("−Rp38.000");
  expect(rows[2]).toHaveTextContent("lebih di 1 dari 2 · +0,5 kg");
  expect(rows[2]).toHaveTextContent("+Rp38.000");
  expect(rows[3]).toHaveTextContent("HPP belum ada");
  expect(
    screen.getByText("Selisih yang sudah diberi alasan tetap dihitung."),
  ).toBeInTheDocument();
  expect(screen.getByText("2 hitungan belum ada HPP")).toBeInTheDocument();
  const link = within(rows[0] as HTMLElement).getByRole("link");
  expect(link.getAttribute("href")).toBe(
    "/owner/laporan/selisih-opname/p1?periode=bulan&dari=2026-11-01&sampai=2026-11-30",
  );
});

test("kosong", async () => {
  serve(report([], { lossValue: 0, lossCount: 0, gainValue: 0, gainCount: 0 }));
  renderApp(PATH);
  expect(
    await screen.findByText("Belum ada selisih opname di periode ini"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/hitungan belum ada HPP/)).not.toBeInTheDocument();
});

test("galat memuat", async () => {
  server.use(
    http.get("*/api/owner/reports/opname", () =>
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
