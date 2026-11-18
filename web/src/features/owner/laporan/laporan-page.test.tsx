import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { ownerTodaySummary } from "@/mocks/owner-summary";
import type {
  OpnameReport,
  SalesReport,
  StockReport,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { renderApp } from "@/test/render-app";

// Fixture bertipe gen: handler stock & opname dibuat T10 di gelombang yang sama.
const STOCK: StockReport = {
  today: "2026-11-05",
  unsold: {
    minDays: 30,
    count: 23,
    heldValue: 3_412_000,
    noCostCount: 2,
    items: [],
  },
  thinMargin: { thresholdPermille: 100, count: 5, items: [] },
};
const OPNAME: OpnameReport = {
  range: { from: "2026-11-01", to: "2026-11-05" },
  lossValue: 412_000,
  lossCount: 9,
  gainValue: 38_000,
  gainCount: 1,
  unknownValueCount: 0,
  items: [],
};

const totals = (over: Partial<SalesReport["current"]> = {}) => ({
  revenue: 48_215_500,
  grossProfit: 7_912_300,
  salesCount: 1_284,
  avgTicket: 37_551,
  newCredit: 1_185_000,
  marginPermille: 164,
  ...over,
});

/** Laporan bulan berjalan 1–5 Nov dengan angka contoh mockup. */
function salesFixture(over: Partial<SalesReport> = {}): SalesReport {
  return {
    period: "bulan",
    range: { from: "2026-11-01", to: "2026-11-05" },
    previous: { from: "2026-10-01", to: "2026-10-05" },
    running: true,
    current: totals(),
    previousTotals: totals({
      revenue: 44_644_000,
      grossProfit: 7_464_434,
      salesCount: 1_223,
      avgTicket: 36_504,
      newCredit: 1_346_591,
      marginPermille: 167,
    }),
    series: {
      kind: "hari",
      buckets: Array.from({ length: 30 }, (_, i) => {
        const key = `2026-11-${String(i + 1).padStart(2, "0")}`;
        return i < 5
          ? { key, revenue: 9_000_000, grossProfit: 1_500_000 }
          : { key, revenue: null, grossProfit: null };
      }),
    },
    topProducts: [],
    categories: [],
    kasir: [],
    ...over,
  };
}

const useSales = (body: SalesReport) =>
  server.use(
    http.get("*/api/owner/reports/sales", () => HttpResponse.json(body)),
  );

beforeEach(async () => {
  // Hanya Date yang dipalsukan agar MSW dan React Query tetap memakai timer asli.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Kamis 5 Nov 2026, 14.30 WIB
  vi.setSystemTime(Date.UTC(2026, 10, 5, 7, 30));
  server.use(
    http.get("*/api/owner/reports/stock", () => HttpResponse.json(STOCK)),
    http.get("*/api/owner/reports/opname", () => HttpResponse.json(OPNAME)),
  );
  await ownerLogin();
});

afterEach(() => {
  vi.useRealTimers();
});

const band = async () => {
  const label = await screen.findByText(/^Omzet \d/);
  const card = label.parentElement;
  if (!card) throw new Error("tanpa pita");
  return within(card);
};

test("bawaan: Bulan berjalan, pita 1–5 Nov dengan pil pembanding 1–5 Okt", async () => {
  renderApp("/owner/laporan");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Laporan" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bulan" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("November 2026")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Periode berikutnya" }),
  ).toBeDisabled();
  const pita = await band();
  expect(pita.getByText("Omzet 1–5 Nov")).toBeInTheDocument();
  expect(
    pita.getByText(/^([▲▼] \d+% dari|Sama dengan) 1–5 Okt$/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Omzet & laba kotor per hari" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("group", {
      name: "Omzet dan laba kotor per hari, 1–5 Nov",
    }),
  ).toBeInTheDocument();

  const tiles = screen.getAllByTestId("report-tile");
  expect(tiles).toHaveLength(4);
  expect(tiles.map((t) => t.querySelector("dt")?.textContent)).toEqual([
    expect.stringMatching(/^Laba kotor/),
    "Transaksi",
    "Rata-rata / struk",
    "Kasbon baru",
  ]);
  // Keempat kartu punya baris pembanding (P6).
  for (const t of tiles)
    expect(t).toHaveTextContent(
      /(dari|Sama dengan|di|Belum ada data) 1–5 Okt$/,
    );
});

test("angka & pembanding dari server apa adanya; label Laba kotor · 16,4%", async () => {
  useSales(salesFixture());
  renderApp("/owner/laporan");
  const pita = await band();
  expect(pita.getByText("Rp48.215.500")).toBeInTheDocument();
  expect(pita.getByText("▲ 8% dari 1–5 Okt")).toBeInTheDocument();
  const tiles = screen.getAllByTestId("report-tile");
  expect(tiles.map((t) => t.textContent)).toEqual([
    "Laba kotor · 16,4%Rp7.912.300▲ 6% dari 1–5 Okt",
    "Transaksi1.284▲ 5% dari 1–5 Okt",
    "Rata-rata / strukRp37.551▲ 3% dari 1–5 Okt",
    "Kasbon baruRp1.185.000▼ 12% dari 1–5 Okt",
  ]);
  expect(
    screen.getByText("Paling ramai Minggu, 1 Nov · Rp9 jt"),
  ).toBeInTheDocument();
});

test("omzet 0 → label Laba kotor tanpa persen; pembanding tanpa data", async () => {
  const zero = totals({
    revenue: 0,
    grossProfit: 0,
    salesCount: 0,
    avgTicket: 0,
    newCredit: 0,
    marginPermille: null,
  });
  useSales(salesFixture({ current: zero, previousTotals: zero }));
  renderApp("/owner/laporan");
  const pita = await band();
  expect(pita.getByText("Belum ada data 1–5 Okt")).toBeInTheDocument();
  const [laba] = screen.getAllByTestId("report-tile");
  expect(laba?.querySelector("dt")).toHaveTextContent(/^Laba kotor$/);
  expect(laba).toHaveTextContent("Belum ada data 1–5 Okt");
});

test("laba minus: angka & pembanding memakai minus U+2212", async () => {
  useSales(
    salesFixture({
      current: totals({ grossProfit: -120_000, marginPermille: -2 }),
      previousTotals: totals({ grossProfit: -50_000, salesCount: 3 }),
    }),
  );
  renderApp("/owner/laporan");
  await band();
  const [laba] = screen.getAllByTestId("report-tile");
  expect(laba).toHaveTextContent(
    "Laba kotor · −0,2%−Rp120.000−Rp50.000 di 1–5 Okt",
  );
});

test("Periode sebelumnya → Oktober penuh dibanding September penuh", async () => {
  const user = userEvent.setup();
  const { router } = renderApp("/owner/laporan");
  await band();
  await user.click(screen.getByRole("button", { name: "Periode sebelumnya" }));
  expect(await screen.findByText("Oktober 2026")).toBeInTheDocument();
  const pita = await band();
  expect(await pita.findByText("Omzet 1–31 Okt")).toBeInTheDocument();
  expect(
    pita.getByText(/^([▲▼] \d+% dari|Sama dengan) 1–30 Sep$/),
  ).toBeInTheDocument();
  expect(router.state.location.search).toEqual({
    periode: "bulan",
    dari: "2026-10-01",
    sampai: "2026-10-31",
  });
  expect(
    screen.getByRole("button", { name: "Periode berikutnya" }),
  ).toBeEnabled();
});

test("Hari → grafik omzet & laba kotor per jam, pembanding Kamis lalu", async () => {
  const user = userEvent.setup();
  renderApp("/owner/laporan");
  await band();
  await user.click(screen.getByRole("button", { name: "Hari" }));
  expect(
    await screen.findByRole("heading", { name: "Omzet & laba kotor per jam" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Kamis, 5 Nov 2026")).toBeInTheDocument();
  const pita = await band();
  expect(pita.getByText("Omzet 5 Nov")).toBeInTheDocument();
  expect(
    pita.getByText(
      /^([▲▼] \d+% dari|Sama dengan|Belum ada data) Kamis, 29 Okt$/,
    ),
  ).toBeInTheDocument();
  // Dua seri omzet & laba (Q6), bukan minggu lalu.
  const legend = screen.getByTestId("chart-legend");
  expect(legend).toHaveTextContent("OmzetLaba kotor");
  expect(
    screen.getByRole("group", { name: "Omzet dan laba kotor per jam, 5 Nov" }),
  ).toBeInTheDocument();
});

test("Hari ini mode Hari = angka Beranda", async () => {
  renderApp("/owner/laporan?periode=hari&dari=2026-11-05&sampai=2026-11-05");
  const pita = await band();
  const beranda = ownerTodaySummary(mockDb.get(), Date.now());
  expect(pita.getByText(formatRupiah(beranda.revenue))).toBeInTheDocument();
  const tiles = screen.getAllByTestId("report-tile");
  expect(tiles[1]).toHaveTextContent(`Transaksi${beranda.salesCount}`);
});

test("Tanggal → lembar Pilih tanggal; 93 hari → Rentang maksimal 92 hari", async () => {
  const user = userEvent.setup();
  renderApp("/owner/laporan");
  await band();
  await user.click(screen.getByRole("button", { name: "Tanggal" }));
  const sheet = await screen.findByRole("dialog", { name: "Pilih tanggal" });
  fireEvent.change(within(sheet).getByLabelText("Dari"), {
    target: { value: "2026-08-04" },
  });
  fireEvent.change(within(sheet).getByLabelText("Sampai"), {
    target: { value: "2026-11-04" },
  });
  expect(
    within(sheet).getByText("Rentang maksimal 92 hari"),
  ).toBeInTheDocument();
  expect(
    within(sheet).getByRole("button", { name: "Tampilkan" }),
  ).toBeDisabled();
});

test("Paling laku 3 teratas + Lihat semua membawa periode", async () => {
  renderApp("/owner/laporan");
  const section = (
    await screen.findByRole("heading", { name: "Paling laku" })
  ).closest("section");
  if (!section) throw new Error("tanpa bagian");
  expect(within(section).getAllByRole("listitem")).toHaveLength(3);
  expect(
    within(section).getByRole("link", { name: "Lihat semua" }),
  ).toHaveAttribute(
    "href",
    "/owner/laporan/paling-laku?periode=bulan&dari=2026-11-01&sampai=2026-11-30",
  );
});

test("Paling laku kosong → Belum ada penjualan", async () => {
  useSales(salesFixture());
  renderApp("/owner/laporan");
  expect(await screen.findByText("Belum ada penjualan")).toBeInTheDocument();
});

test("baris stok & opname dari server: tidak terjual, rincian bertautan", async () => {
  renderApp("/owner/laporan");
  const unsold = await screen.findByRole("link", {
    name: "23 barang Modal tertahan Rp3.412.000",
  });
  expect(unsold.getAttribute("href")).toMatch(
    /^\/owner\/laporan\/tidak-terjual\?periode=bulan&/,
  );
  expect(
    screen.getByRole("heading", { name: "Tidak terjual ≥ 30 hari" }),
  ).toBeInTheDocument();
  const link = (name: RegExp) => screen.getByRole("link", { name });
  expect(link(/^Per kategori$/).getAttribute("href")).toMatch(
    /^\/owner\/laporan\/kategori\?periode=bulan&dari=2026-11-01&sampai=2026-11-30$/,
  );
  expect(link(/^Per kasir$/).getAttribute("href")).toMatch(
    /^\/owner\/laporan\/kasir\?/,
  );
  expect(link(/^Selisih opname −Rp412\.000$/).getAttribute("href")).toMatch(
    /^\/owner\/laporan\/selisih-opname\?/,
  );
  expect(link(/^Untung tipis 5 barang$/).getAttribute("href")).toMatch(
    /^\/owner\/laporan\/untung-tipis\?/,
  );
});

test("stok & opname kosong: Semua terjual, Rp0, Tidak ada", async () => {
  server.use(
    http.get("*/api/owner/reports/stock", () =>
      HttpResponse.json({
        ...STOCK,
        unsold: { ...STOCK.unsold, count: 0, heldValue: 0, noCostCount: 0 },
        thinMargin: { ...STOCK.thinMargin, count: 0 },
      } satisfies StockReport),
    ),
    http.get("*/api/owner/reports/opname", () =>
      HttpResponse.json({ ...OPNAME, lossValue: 0, lossCount: 0 }),
    ),
  );
  renderApp("/owner/laporan");
  expect(
    await screen.findByText("Semua barang terjual dalam 30 hari terakhir"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /^Selisih opname Rp0$/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /^Untung tipis Tidak ada$/ }),
  ).toBeInTheDocument();
});

test("galat → pesanError + Coba lagi memuat ulang", async () => {
  const user = userEvent.setup();
  server.use(
    http.get("*/api/owner/reports/sales", () => HttpResponse.error(), {
      once: true,
    }),
  );
  renderApp("/owner/laporan");
  expect(
    await screen.findByText("Server tidak tersambung — coba lagi"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByText("Omzet 1–5 Nov")).toBeInTheDocument();
});

test("memuat → kerangka, lalu data", async () => {
  renderApp("/owner/laporan");
  const busy = await screen.findByLabelText("Memuat laporan");
  expect(busy).toHaveAttribute("aria-busy", "true");
  expect(await screen.findByText("Omzet 1–5 Nov")).toBeInTheDocument();
  expect(screen.queryByLabelText("Memuat laporan")).not.toBeInTheDocument();
});

test("search tidak sah → bulan berjalan", async () => {
  const { router } = renderApp("/owner/laporan?periode=minggu&dari=2026-11-03");
  expect(await screen.findByText("Omzet 1–5 Nov")).toBeInTheDocument();
  expect(router.state.location.search).toEqual({
    periode: "bulan",
    dari: "2026-11-01",
    sampai: "2026-11-30",
  });
});

test("ganti periode: periode lama tetap tampil (redup, Memuat…) sampai data baru tiba, tanpa kerangka", async () => {
  const user = userEvent.setup();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const october = salesFixture({
    range: { from: "2026-10-01", to: "2026-10-31" },
    previous: { from: "2026-09-01", to: "2026-09-30" },
    running: false,
  });
  server.use(
    http.get("*/api/owner/reports/sales", async ({ request }) => {
      if (new URL(request.url).searchParams.get("from") !== "2026-10-01")
        return HttpResponse.json(salesFixture());
      await gate;
      return HttpResponse.json(october);
    }),
  );
  renderApp("/owner/laporan");
  expect(await screen.findByText("Omzet 1–5 Nov")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Periode sebelumnya" }));
  expect(await screen.findByText("Oktober 2026")).toBeInTheDocument();
  expect(await screen.findByText("Memuat…")).toBeInTheDocument();
  // Angka periode lama tetap terlihat, ditandai sibuk; kerangka tidak muncul.
  expect(screen.getByText("Omzet 1–5 Nov")).toBeInTheDocument();
  expect(screen.getByTestId("laporan-isi")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(screen.queryByLabelText("Memuat laporan")).toBeNull();

  release();
  expect(await screen.findByText("Omzet 1–31 Okt")).toBeInTheDocument();
  expect(screen.queryByText("Memuat…")).toBeNull();
  expect(screen.getByTestId("laporan-isi")).not.toHaveAttribute("aria-busy");
});
