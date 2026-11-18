import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  OpnameCountRow,
  OpnameProductReport,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const PATH =
  "/owner/laporan/selisih-opname/p1?periode=bulan&dari=2026-11-01&sampai=2026-11-30";

const wed = Date.UTC(2026, 10, 4, 3, 5); // Rab 4 Nov, 10.05 WIB
const oct31 = Date.UTC(2026, 9, 31, 5, 0);

const row = (over: Partial<OpnameCountRow>): OpnameCountRow => ({
  sessionId: "s1",
  countedAt: wed,
  counterName: "Dedi",
  diffQtyBase: -6,
  value: 126_000,
  reason: "hilang",
  state: "disetujui",
  previousCountedAt: oct31,
  duty: [
    { name: "Dedi", shifts: 1, records: 0 },
    { name: "Rina", shifts: 4, records: 2 },
  ],
  ...over,
});

const body = (
  over: Partial<OpnameProductReport> = {},
): OpnameProductReport => ({
  productId: "p1",
  productName: "Rokok Gudang Garam 12",
  unitName: "bks",
  unitSize: 1,
  isCurah: false,
  countTotal: 3,
  shortCount: 2,
  overCount: 0,
  repeated: true,
  shortQtyBase: 14,
  overQtyBase: 0,
  lossValue: 294_000,
  gainValue: 0,
  range: { from: "2026-11-01", to: "2026-11-05" },
  dutyOnShort: [
    { name: "Dedi", intervals: 1 },
    { name: "Rina", intervals: 2 },
  ],
  counts: [
    row({}),
    row({
      sessionId: "s2",
      countedAt: Date.UTC(2026, 10, 3, 3, 0),
      counterName: "Pemilik",
      diffQtyBase: 0,
      value: 0,
      reason: null,
      state: "cocok",
      previousCountedAt: null,
      duty: [],
    }),
    row({
      sessionId: "s3",
      countedAt: Date.UTC(2026, 10, 2, 3, 0),
      diffQtyBase: -8,
      value: null,
      reason: "rusak",
      previousCountedAt: null,
      duty: [],
    }),
  ],
  ...over,
});

const serve = (b: OpnameProductReport) =>
  server.use(
    http.get("*/api/owner/reports/opname/p1", () => HttpResponse.json(b)),
  );

beforeEach(async () => {
  await ownerLogin();
});

test("kartu, bertugas urut server, hitungan dan kotak bertugas", async () => {
  serve(body());
  renderApp(PATH);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Rokok Gudang Garam 12",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("1–30 Nov")).toBeInTheDocument();
  const card = screen.getByLabelText("Ringkasan selisih");
  expect(card).toHaveTextContent("Kurang−Rp294.000");
  expect(card).toHaveTextContent("−14 bks · kurang di 2 dari 3 hitungan");
  const duty = screen.getByRole("region", { name: "Bertugas saat kurang" });
  const dutyRows = within(duty).getAllByRole("listitem");
  expect(dutyRows[0]).toHaveTextContent("Dedi1 dari 2");
  expect(dutyRows[1]).toHaveTextContent("Rina2 dari 2");
  expect(
    screen.getByText(
      "Petunjuk, bukan bukti — cocokkan dengan CCTV atau catatan laci.",
    ),
  ).toBeInTheDocument();
  const counts = within(
    screen.getByRole("region", { name: "Hitungan" }),
  ).getAllByRole("listitem");
  expect(counts).toHaveLength(3);
  expect(counts[0]).toHaveTextContent("Rab, 4 Nov · 10.05");
  expect(counts[0]).toHaveTextContent("−Rp126.000");
  expect(counts[0]).toHaveTextContent("−6 bks · dihitung Dedi · Hilang");
  expect(counts[0]).toHaveTextContent(
    "Sejak hitungan 31 Okt: Dedi 1 shift · Rina 4 shift, 2 catatan",
  );
  expect(counts[1]).toHaveTextContent("Cocok · dihitung Pemilik");
  expect(counts[1]).not.toHaveTextContent("Hitungan pertama");
  expect(counts[2]).toHaveTextContent("HPP belum ada");
  expect(counts[2]).toHaveTextContent("−8 bks · dihitung Dedi · Rusak");
  expect(counts[2]).toHaveTextContent("Hitungan pertama");
});

test("hanya lebih: kartu Lebih, tanpa bagian bertugas", async () => {
  serve(
    body({
      shortCount: 0,
      overCount: 1,
      repeated: false,
      shortQtyBase: 0,
      overQtyBase: 2,
      lossValue: 0,
      gainValue: 42_000,
      dutyOnShort: [],
      counts: [
        row({
          diffQtyBase: 2,
          value: 42_000,
          reason: null,
          state: "disetujui",
        }),
      ],
      countTotal: 1,
    }),
  );
  renderApp(PATH);
  const card = await screen.findByLabelText("Ringkasan selisih");
  expect(card).toHaveTextContent("Lebih+Rp42.000");
  expect(card).toHaveTextContent("+2 bks · lebih di 1 dari 1 hitungan");
  expect(
    screen.queryByRole("region", { name: "Bertugas saat kurang" }),
  ).not.toBeInTheDocument();
  const li = within(screen.getByRole("region", { name: "Hitungan" })).getByRole(
    "listitem",
  );
  expect(li).toHaveTextContent("+2 bks · dihitung Dedi");
  expect(li).not.toHaveTextContent("Sejak hitungan");
});

test("barang tidak ditemukan: pesan galat", async () => {
  server.use(
    http.get("*/api/owner/reports/opname/p1", () =>
      HttpResponse.json(
        { status: 404, title: "Barang tidak ditemukan", code: "NOT_FOUND" },
        { status: 404 },
      ),
    ),
  );
  renderApp(PATH);
  expect(
    await screen.findByRole("button", { name: "Coba lagi" }),
  ).toBeInTheDocument();
});
