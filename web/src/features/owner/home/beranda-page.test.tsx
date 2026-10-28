import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  loginWithShift,
  ownerLogin,
  post,
  unitOf,
} from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import { getGetOwnerTodaySummaryQueryKey } from "@/shared/api/gen/owner/owner";
import { newId } from "@/shared/lib/id";
import { renderApp } from "@/test/render-app";

const SUMMARY_KEY = getGetOwnerTodaySummaryQueryKey();

beforeEach(() => {
  // Hanya Date yang dipalsukan agar MSW dan React Query tetap memakai timer asli.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Sabtu 17 Okt 2026, 09.00 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 2, 0));
});

afterEach(() => {
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
  await sellAndCloseShiftShort();
  await ownerLogin();
  renderApp("/owner");

  expect(await screen.findByText("OMZET HARI INI")).toBeInTheDocument();
  expect(card("OMZET HARI INI").getByText("Rp36.000")).toBeInTheDocument();
  expect(
    card("OMZET HARI INI").getByText(/^[▲▼] \d+% dari Sabtu lalu$/),
  ).toBeInTheDocument();

  expect(
    screen.getByRole("heading", { name: "Omzet per jam" }),
  ).toBeInTheDocument();
  const chart = screen.getByRole("group", {
    name: "Omzet per jam hari ini dan Sabtu lalu",
  });
  // garis minggu lalu berisi riwayat seed
  expect(
    chart.querySelector('path[stroke="var(--color-chart-2)"]'),
  ).not.toBeNull();

  expect(card("TRANSAKSI").getByText("1")).toBeInTheDocument();
  expect(card("LABA KOTOR").getByText(/^Rp[\d.]+$/)).toBeInTheDocument();
  expect(card("KASBON BARU").getByText("Rp0")).toBeInTheDocument();
  expect(card("RATA-RATA / STRUK").getByText("Rp36.000")).toBeInTheDocument();

  expect(screen.getByText("PERLU PERHATIAN")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "7 barang stok menipis" }),
  ).toHaveAttribute("href", "/owner/barang");
  expect(
    screen.getByRole("link", { name: "Selisih kas shift Rina -Rp5.000" }),
  ).toHaveAttribute("href", "/owner/lainnya");
  expect(
    screen.getByRole("link", { name: /^\d+ kasbon > 30 hari · Rp[\d.]+$/ }),
  ).toHaveAttribute("href", "/owner/kasbon");
  expect(screen.queryByText("Semua aman hari ini")).not.toBeInTheDocument();
});

test("tanpa penjualan dan tanpa perhatian: belum ada pembanding dan semua aman", async () => {
  mockDb.update((s) => {
    s.sales = [];
    s.minStock = {};
    s.creditLedger = [];
    for (const c of s.customers) c.balance = 0;
  });
  await ownerLogin();
  renderApp("/owner");

  expect(
    await screen.findByText("Belum ada data Sabtu lalu"),
  ).toBeInTheDocument();
  expect(card("OMZET HARI INI").getByText("Rp0")).toBeInTheDocument();
  expect(screen.getByText("Semua aman hari ini")).toBeInTheDocument();
});

test("kerangka saat memuat pertama, lalu data", async () => {
  await ownerLogin();
  renderApp("/owner");
  const busy = await screen.findByLabelText("Memuat beranda");
  expect(busy).toHaveAttribute("aria-busy", "true");
  expect(await screen.findByText("OMZET HARI INI")).toBeInTheDocument();
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
  expect(await screen.findByText("OMZET HARI INI")).toBeInTheDocument();
});

test("refetch gagal saat data sudah ada → data lama tetap, tanpa layar galat", async () => {
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  await screen.findByText("OMZET HARI INI");

  setScenario("server-mati");
  await act(() => queryClient.refetchQueries({ queryKey: SUMMARY_KEY }));
  expect(screen.getByText("OMZET HARI INI")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
  expect(screen.queryByLabelText("Memuat beranda")).toBeNull();
});

test("server mati lalu jam berganti: garis hari ini berhenti di jam data terakhir", async () => {
  // Sabtu 17 Okt 2026, 10.00 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 3, 0));
  await ownerLogin();
  renderApp("/owner");
  await screen.findByText("OMZET HARI INI");

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
    expect(screen.getByText("Rp36.000", { selector: "p" })).toBeInTheDocument(),
  );

  await act(() => vi.advanceTimersByTimeAsync(1000));
  await vi.waitFor(() => expect(has("2026-10-18")).toBe(true));
  // Angka hari kemarin tidak tampil sebagai angka hari baru.
  await vi.waitFor(() =>
    expect(card("OMZET HARI INI").getByText("Rp0")).toBeInTheDocument(),
  );
  expect(screen.queryByText("Rp36.000")).not.toBeInTheDocument();
});

test("tarik untuk refresh di layar sentuh memuat ulang ringkasan", async () => {
  await ownerLogin();
  const { queryClient } = renderApp("/owner");
  await screen.findByText("OMZET HARI INI");
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
