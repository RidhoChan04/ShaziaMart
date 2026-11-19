import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { reviewSeedSamples } from "@/mocks/attention-fixtures";
import { mockDb } from "@/mocks/db";
import {
  loginWithShift,
  ownerLogin,
  post,
  unitOf,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { ownerTodaySummary } from "@/mocks/owner-summary";
import { setScenario } from "@/mocks/scenarios";
import { getGetOwnerTodaySummaryQueryKey } from "@/shared/api/gen/owner/owner";
import type {
  Attention,
  ExceptionAttention,
  ExceptionKind,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { renderApp } from "@/test/render-app";
import { stubWidth } from "@/test/resize-observer";

const SUMMARY_KEY = getGetOwnerTodaySummaryQueryKey();

beforeEach(() => {
  // Hanya Date yang dipalsukan agar MSW dan React Query tetap memakai timer asli.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Sabtu 17 Okt 2026, 09.00 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 2, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const card = (label: string) => {
  const el = screen.getByText(label).closest<HTMLElement>("section, div");
  if (!el) throw new Error(`tanpa kartu ${label}`);
  return within(el);
};

function pullToRefresh() {
  fireEvent.touchStart(document, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(document, { touches: [{ clientY: 180 }] });
  fireEvent.touchEnd(document);
}

/** Kasir Rina menjual 1 Bimoli tunai, lalu menutup shift dengan uang kurang Rp5.000. */
async function sellAndCloseShiftShort() {
  await loginWithShift(200_000);
  const res = await post("/api/sales", {
    saleId: newId(),
    items: [
      {
        unitId: unitOf("Minyak Goreng Bimoli 2 L").id,
        expectedUnitPrice: 36_000,
        qtyBase: 1,
      },
    ],
    payments: [{ method: "cash", amount: 36_000 }],
    cashReceived: 36_000,
    print: false,
  });
  expect(res.status).toBe(201);
  await post("/api/shifts/current/close", { countedCash: 231_000 });
}

test("omzet, perbandingan, grafik, tile, dan perlu perhatian tampil dari mock", async () => {
  // (K20) Contoh seed F3c-2a ditinjau sampai sesaat sebelum selisih kas kasir ini.
  mockDb.update((s) => reviewSeedSamples(s, Date.now() - 1));
  await sellAndCloseShiftShort();
  await ownerLogin();
  renderApp("/owner");

  expect(await screen.findByText("Omzet hari ini")).toBeInTheDocument();
  expect(card("Omzet hari ini").getByText("Rp36.000")).toBeInTheDocument();
  expect(
    card("Omzet hari ini").getByText(/^[▲▼] \d+% dari Sabtu lalu$/),
  ).toBeInTheDocument();

  expect(
    screen.getByRole("heading", { name: "Omzet per jam" }),
  ).toBeInTheDocument();
  const chart = screen.getByRole("group", {
    name: "Omzet per jam hari ini dan Sabtu lalu",
  });
  // batang minggu lalu berisi riwayat seed
  expect(
    chart.querySelector('rect[fill="var(--color-chart-2)"]'),
  ).not.toBeNull();
  expect(
    screen.getByText(/^Paling ramai jam \d{2}\.00 · Rp/),
  ).toBeInTheDocument();

  expect(card("Transaksi").getByText("1")).toBeInTheDocument();
  expect(card("Laba kotor").getByText(/^Rp[\d.]+$/)).toBeInTheDocument();
  expect(card("Kasbon baru").getByText("Rp0")).toBeInTheDocument();
  expect(card("Rata-rata / struk").getByText("Rp36.000")).toBeInTheDocument();

  // Pengganti butir selisih kas lama (keputusan S6): kejadian selisih_kas dengan nilai bertanda.
  expect(
    screen.getByRole("heading", { name: "Perlu perhatian · 4" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /^1 selisih kas\s17 Okt · −Rp5\.000$/ }),
  ).toHaveAttribute("href", "/owner/pengecualian/selisih_kas");
  expect(
    screen.getByRole("link", { name: /^Stok menipis\s7 barang$/ }),
  ).toHaveAttribute("href", "/owner/barang");
  expect(
    screen.getByRole("link", {
      name: /^Kasbon > 30 hari\s\d+ pelanggan · Rp[\d.]+$/,
    }),
  ).toHaveAttribute("href", "/owner/kasbon");
  expect(screen.queryByText("Semua aman hari ini")).not.toBeInTheDocument();
});

test("omzet sangat besar di pita: ukuran huruf turun (30px di 296px), tidak dipotong", async () => {
  server.use(
    http.get("/api/owner/summary/today", () =>
      HttpResponse.json({
        ...ownerTodaySummary(mockDb.get(), Date.now()),
        revenue: 123_456_789_012,
      }),
    ),
  );
  stubWidth(296);
  await ownerLogin();
  renderApp("/owner");
  const amount = await screen.findByText("Rp123.456.789.012");
  expect(amount).toHaveClass("num");
  expect(amount).not.toHaveClass("truncate");
  expect(amount.style.fontSize).toBe("30px");
});

test("tile Laba kotor Rp12.345.678 tidak memakai truncate dan font-size < 21px", async () => {
  server.use(
    http.get("/api/owner/summary/today", () =>
      HttpResponse.json({
        ...ownerTodaySummary(mockDb.get(), Date.now()),
        grossProfit: 12_345_678,
      }),
    ),
  );
  stubWidth(132);
  await ownerLogin();
  renderApp("/owner");
  const amount = await screen.findByText("Rp12.345.678");
  expect(amount).not.toHaveClass("truncate");
  expect(Number.parseInt(amount.style.fontSize, 10)).toBeLessThan(21);
  expect(amount.style.fontSize).toBe("18px");
});

test("tanpa penjualan dan tanpa perhatian: belum ada pembanding dan semua aman", async () => {
  mockDb.update((s) => {
    s.sales = [];
    s.minStock = {};
    s.creditLedger = [];
    for (const c of s.customers) c.balance = 0;
    // (K20) Contoh seed F3c-2a sudah ditinjau.
    reviewSeedSamples(s, Date.now());
  });
  await ownerLogin();
  renderApp("/owner");

  expect(
    await screen.findByText("Belum ada data Sabtu lalu"),
  ).toBeInTheDocument();
  expect(card("Omzet hari ini").getByText("Rp0")).toBeInTheDocument();
  expect(screen.getByText("Semua aman hari ini")).toBeInTheDocument();
});

test("kerangka saat memuat pertama, lalu data", async () => {
  await ownerLogin();
  renderApp("/owner");
  const busy = await screen.findByLabelText("Memuat beranda");
  expect(busy).toHaveAttribute("aria-busy", "true");
  expect(await screen.findByText("Omzet hari ini")).toBeInTheDocument();
  expect(screen.queryByLabelText("Memuat beranda")).not.toBeInTheDocument();
});

test("gagal tanpa data → pesan galat dan Coba lagi memuat ulang", async () => {
  const user = userEvent.setup();
  await ownerLogin();
  const { router } = renderApp("/owner/barang");
  await screen.findByRole("heading", { level: 1, name: "Barang" });

  setScenario("server-mati");
  await act(() => router.navigate({ to: "/owner" }));
  expect(
    await screen.findByText("Server tidak tersambung — coba lagi"),
  ).toBeInTheDocument();

  setScenario("normal");
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByText("Omzet hari ini")).toBeInTheDocument();
});

test("refetch gagal saat data sudah ada → data lama tetap, tanpa layar galat", async () => {
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  await screen.findByText("Omzet hari ini");

  setScenario("server-mati");
  await act(() => queryClient.refetchQueries({ queryKey: SUMMARY_KEY }));
  expect(screen.getByText("Omzet hari ini")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
  expect(screen.queryByLabelText("Memuat beranda")).toBeNull();
});

test("server mati lalu jam berganti: batang hari ini berhenti di jam data terakhir", async () => {
  // Sabtu 17 Okt 2026, 10.00 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 3, 0));
  await ownerLogin();
  renderApp("/owner");
  await screen.findByText("Omzet hari ini");

  // 13.00 WIB, server mati: tarik-segarkan gagal, data 10.00 tetap tampil.
  setScenario("server-mati");
  vi.setSystemTime(Date.UTC(2026, 9, 17, 6, 0));
  pullToRefresh();
  expect(screen.getByText("Memuat…")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Memuat…")).toBeNull());

  const row = (hour: string) =>
    within(screen.getByRole("table")).getByRole("row", {
      name: new RegExp(`^${hour}`),
    });
  expect(row("10.00")).toHaveTextContent(/^10\.00Rp/);
  for (const hour of ["11.00", "12.00", "13.00"]) {
    expect(row(hour)).toHaveTextContent(new RegExp(`^${hour}-Rp`));
  }
});

test("kunci query memuat tanggal bisnis; ganti hari → kunci baru", async () => {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  // Sabtu 17 Okt 2026, 23.59.59 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 16, 59, 59));
  await sellAndCloseShiftShort();
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  const has = (date: string) =>
    queryClient.getQueryCache().find({ queryKey: [...SUMMARY_KEY, date] }) !==
    undefined;
  await vi.waitFor(() => expect(has("2026-10-17")).toBe(true));
  expect(has("2026-10-18")).toBe(false);
  await vi.waitFor(() =>
    expect(
      screen.getByText("Rp36.000", { selector: "p > span" }),
    ).toBeInTheDocument(),
  );

  await act(() => vi.advanceTimersByTimeAsync(1000));
  await vi.waitFor(() => expect(has("2026-10-18")).toBe(true));
  // Angka hari kemarin tidak tampil sebagai angka hari baru.
  await vi.waitFor(() =>
    expect(card("Omzet hari ini").getByText("Rp0")).toBeInTheDocument(),
  );
  expect(screen.queryByText("Rp36.000")).not.toBeInTheDocument();
});

test("tarik untuk refresh di layar sentuh memuat ulang ringkasan", async () => {
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  await screen.findByText("Omzet hari ini");
  setScenario("lambat");
  const fetches = vi.fn();
  queryClient.getQueryCache().subscribe((e) => {
    if (
      e.type === "updated" &&
      e.action.type === "fetch" &&
      e.query.queryKey[0] === SUMMARY_KEY[0]
    )
      fetches();
  });

  pullToRefresh();

  expect(await screen.findByText("Memuat…")).toBeInTheDocument();
  expect(fetches).toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText("Memuat…")).toBeNull());
});

test("perlu perhatian: butir modal berubah dan barang habis membuka lembar di detail barang", async () => {
  const find = (name: string) => {
    const p = mockDb.get().products.find((x) => x.name === name);
    if (!p) throw new Error(`seed tanpa ${name}`);
    return p.id;
  };
  const indomie = find("Indomie Goreng");
  const beras = find("Beras Pandan Wangi 5 kg");
  mockDb.update((s) => {
    const p = s.products.find((x) => x.id === indomie);
    const b = s.products.find((x) => x.id === beras);
    if (!p || !b) throw new Error("seed");
    p.cost = { amount: 108000, qtyBase: 40 };
    s.costAlerts[indomie] = {
      fromCost: { amount: 104000, qtyBase: 40 },
      changedAt: Date.UTC(2026, 9, 17, 1, 0),
      source: "pemilik",
    };
    b.status = "tidak_diambil";
    b.stockCounted = true;
    s.stock[beras] = 0;
    // (K20) Contoh seed F3c-2a sudah ditinjau agar butir buatan tes ini tidak terdorong lewat enam.
    reviewSeedSamples(s, Date.now());
  });
  await ownerLogin();
  renderApp("/owner");

  expect(
    await screen.findByRole("link", {
      name: /^Harga modal Indomie Goreng naik Rp100\sUntung jadi Rp400$/,
    }),
  ).toHaveAttribute("href", `/owner/barang/${indomie}?lembar=harga`);
  expect(
    screen.getByRole("link", {
      name: /^Beras Pandan Wangi 5 kg habis\sTidak diambil lagi$/,
    }),
  ).toHaveAttribute("href", `/owner/barang/${beras}?lembar=habis`);
});

// --- Perlu perhatian: maksimal enam baris, judul berjumlah, Lihat semua (S6, S8) ---

const ex = (
  kind: ExceptionKind,
  patch: Partial<ExceptionAttention>,
): ExceptionAttention => ({
  kind,
  count: 1,
  total: 0,
  shortage: 0,
  from: "2026-10-16",
  to: "2026-10-16",
  latestAt: 0,
  kasirId: null,
  kasirName: null,
  longestMinutes: null,
  ...patch,
});

function baseAttention(): Attention {
  return {
    ...ownerTodaySummary(mockDb.get(), Date.now()).attention,
    lowStockCount: 0,
    negativeStockCount: 0,
    overdueCredit: { count: 0, total: 0 },
    costChanges: [],
    stockOuts: [],
    awaitingPriceCount: 0,
    opnameHeldCount: 0,
    opnameFlags: [],
    opnameReplacedHeld: 0,
    expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
    supplierDebts: {
      overdueCount: 0,
      overdueTotal: 0,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    },
    qrisUnreconciled: null,
    exceptions: [],
  };
}

/** Sembilan butir seperti mockup: enam kejadian, Stok minus, QRIS, Stok menipis. */
function nine(): Attention {
  return {
    ...baseAttention(),
    lowStockCount: 7,
    negativeStockCount: 3,
    qrisUnreconciled: { count: 3, from: "2026-10-13", to: "2026-10-15" },
    exceptions: [
      ex("batal_kas_keluar", { total: 35_000 }),
      ex("selisih_kas", { count: 2, total: -6_000, shortage: -12_000 }),
      ex("kas_keluar", { count: 2, total: 157_000 }),
      ex("serah_terima", { total: -20_000 }),
      ex("shift_lama", { longestMinutes: 13 * 60 }),
      ex("selisih_kecil", {
        count: 5,
        total: -21_500,
        shortage: -21_500,
        kasirId: "u-budi",
        kasirName: "Budi",
      }),
    ],
  };
}

function serveAttention(get: () => Attention) {
  server.use(
    http.get("/api/owner/summary/today", () =>
      HttpResponse.json({
        ...ownerTodaySummary(mockDb.get(), Date.now()),
        attention: get(),
      }),
    ),
  );
}

const attentionSection = async () =>
  within(
    (await screen.findByRole("heading", { name: /^Perlu perhatian/ })).closest(
      "section",
    ) as HTMLElement,
  );

const rowTitles = (section: ReturnType<typeof within>) =>
  section
    .getAllByRole("link")
    .map((a: HTMLElement) => a.textContent?.replace(/\s+/g, " ").trim() ?? "");

test("sembilan butir: judul berjumlah, enam baris pertama, lalu Lihat semua (9) ke /owner/perhatian", async () => {
  serveAttention(nine);
  await ownerLogin();
  renderApp("/owner");

  const section = await attentionSection();
  expect(
    screen.getByRole("heading", { name: "Perlu perhatian · 9" }),
  ).toBeInTheDocument();
  expect(rowTitles(section)).toEqual([
    "1 kas keluar dibatalkan kasir 16 Okt · Rp35.000",
    "2 selisih kas 16 Okt · −Rp12.000 · +Rp6.000",
    "2 kas keluar besar 16 Okt · Rp157.000",
    "1 modal awal berbeda 16 Okt · −Rp20.000",
    "1 shift kelamaan buka 16 Okt · terlama 13 jam",
    "Selisih kecil berulang · Budi 16 Okt · 5 shift · −Rp21.500",
    "Lihat semua (9)",
  ]);
  expect(
    section.getByRole("link", { name: "Lihat semua (9)" }),
  ).toHaveAttribute("href", "/owner/perhatian");
  // Baris Beranda tetap tautan: tanpa tombol tinjau.
  expect(section.queryByRole("button")).toBeNull();
});

test("enam butir atau kurang: tanpa tautan Lihat semua, judul tetap memuat jumlah", async () => {
  serveAttention(() => ({
    ...nine(),
    qrisUnreconciled: null,
    lowStockCount: 0,
    negativeStockCount: 0,
  }));
  await ownerLogin();
  renderApp("/owner");

  const section = await attentionSection();
  expect(
    screen.getByRole("heading", { name: "Perlu perhatian · 6" }),
  ).toBeInTheDocument();
  expect(section.getAllByRole("link")).toHaveLength(6);
  expect(section.queryByText(/Lihat semua/)).toBeNull();
});

test("tanpa butir: judul Perlu perhatian tanpa angka dan Semua aman hari ini", async () => {
  serveAttention(baseAttention);
  await ownerLogin();
  renderApp("/owner");

  expect(
    await screen.findByRole("heading", { name: "Perlu perhatian" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Semua aman hari ini")).toBeInTheDocument();
  expect(screen.queryByText(/Lihat semua/)).toBeNull();
});

test("butir ke-7 naik ke baris keenam setelah butir di atasnya ditinjau (S8)", async () => {
  let attention = nine();
  serveAttention(() => attention);
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  const before = await attentionSection();
  expect(rowTitles(before)).not.toContain("Stok minus 3 barang");

  // Selisih kas ditinjau dari halaman Lihat semua: ringkasan dimuat ulang tanpa butir itu.
  attention = {
    ...attention,
    exceptions: attention.exceptions.filter((e) => e.kind !== "selisih_kas"),
  };
  await act(() => queryClient.invalidateQueries({ queryKey: SUMMARY_KEY }));

  const after = await attentionSection();
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Perlu perhatian · 8" }),
    ).toBeInTheDocument(),
  );
  const titles = rowTitles(after);
  expect(titles[5]).toBe("Stok minus 3 barang");
  expect(titles.at(-1)).toBe("Lihat semua (8)");
});

test("selisih kas hanya lebih: nada peringatan; ada kurang: nada kritis", async () => {
  serveAttention(() => ({
    ...baseAttention(),
    exceptions: [
      ex("selisih_kas", { count: 2, total: -6_000, shortage: -12_000 }),
      ex("serah_terima", { total: 5_000 }),
    ],
  }));
  await ownerLogin();
  renderApp("/owner");

  const section = await attentionSection();
  const box = (name: RegExp) =>
    section.getByRole("link", { name }).querySelector("span[aria-hidden]");
  expect(box(/selisih kas/)).toHaveClass("bg-danger");
  expect(box(/modal awal berbeda/)).toHaveClass("bg-warning");
  expect(
    section.getByRole("link", { name: /modal awal berbeda/ }),
  ).toHaveTextContent("+Rp5.000");
});

test("nama kasir panjang di butir Selisih kecil berulang: judul membungkus, rincian satu baris, tidak ada gulir samping", async () => {
  const longName = "Maria Magdalena Setiawati Kusumawardhani";
  serveAttention(() => ({
    ...baseAttention(),
    exceptions: [
      ex("selisih_kecil", {
        count: 5,
        total: -21_500,
        shortage: -21_500,
        kasirId: "u-panjang",
        kasirName: longName,
      }),
    ],
  }));
  await ownerLogin();
  renderApp("/owner");

  const section = await attentionSection();
  const link = section.getByRole("link", {
    name: new RegExp(`Selisih kecil berulang · ${longName}`),
  });
  const [title, detail] = Array.from(link.querySelectorAll("span.block"));
  // Judul membungkus (nama utuh terbaca); rincian bergaya satu baris.
  expect(title).not.toHaveClass("truncate");
  expect(title).toHaveTextContent(longName);
  expect(detail).toHaveClass("truncate");
  expect(link.querySelector("span.min-w-0")).not.toBeNull();
  expect(link).toHaveAttribute(
    "href",
    "/owner/pengecualian/selisih_kecil?kasirId=u-panjang",
  );
});
