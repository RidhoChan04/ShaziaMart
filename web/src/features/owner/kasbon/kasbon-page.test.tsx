import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { reviewSeedSamples } from "@/mocks/attention-fixtures";
import { mockDb } from "@/mocks/db";
import { customerId, ownerLogin } from "@/mocks/handlers/test-helpers";
import { appendCredit } from "@/mocks/ledger";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";
import { stubWidth } from "@/test/resize-observer";

beforeEach(async () => {
  // Hanya Date yang dipalsukan agar MSW dan React Query tetap memakai timer asli.
  vi.useFakeTimers({ toFake: ["Date"] });
  // Kamis 5 Nov 2026, 10.00 WIB
  vi.setSystemTime(Date.UTC(2026, 10, 5, 3));
  await ownerLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Pelanggan dengan saldo −40.000 (Lebih bayar, Q8). */
function plantOverpaid() {
  mockDb.update((s) => {
    s.customers.push({
      id: "cus-lebih",
      name: "Pak Bayar",
      phone: "081234500099",
      creditLimit: 300_000,
      balance: 0,
    });
    appendCredit(s, {
      customerId: "cus-lebih",
      amount: -40_000,
      at: Date.now(),
      saleId: null,
      paymentId: null,
    });
  });
}

const pelangganRows = () =>
  within(screen.getByRole("region", { name: "Pelanggan" })).getAllByRole(
    "listitem",
  );

const summaryCard = () =>
  screen.findByRole("region", { name: "Ringkasan kasbon" });

test("kartu Total kasbon dan tiga kelompok umur dari ringkasan server", async () => {
  plantOverpaid();
  renderApp("/owner/kasbon");
  const card = await summaryCard();
  // Bu Tini 640.000 + Bu Sari 120.000 + Pak Joko 290.000 + Pak Udin 50.000; Lebih bayar tidak ikut.
  expect(within(card).getByText("Total kasbon")).toBeInTheDocument();
  expect(within(card).getByText("Rp1.100.000")).toBeInTheDocument();
  expect(within(card).getByText("4 pelanggan")).toBeInTheDocument();

  const groups = within(card).getAllByRole("listitem");
  expect(groups).toHaveLength(3);
  expect(groups[0]).toHaveTextContent("0–7 hari");
  expect(groups[0]).toHaveTextContent("0 pelanggan");
  expect(groups[0]).toHaveTextContent("Rp0");
  expect(groups[1]).toHaveTextContent("8–30 hari");
  expect(groups[1]).toHaveTextContent("1 pelanggan");
  expect(groups[1]).toHaveTextContent("Rp290.000");
  expect(groups[2]).toHaveTextContent("Lebih dari 30 hari");
  expect(groups[2]).toHaveTextContent("3 pelanggan");
  expect(groups[2]).toHaveTextContent("Rp810.000");
});

test("kelompok Lebih dari 30 hari bertanda ikon + teks bila ada pelanggan", async () => {
  renderApp("/owner/kasbon");
  const card = await summaryCard();
  const groups = within(card).getAllByRole("listitem");
  expect(groups[2]?.querySelector("svg")).not.toBeNull();
  expect(groups[2]).toHaveTextContent("3 pelanggan");
  expect(groups[0]?.querySelector("svg")).toBeNull();
  expect(groups[1]?.querySelector("svg")).toBeNull();
});

test("tanpa tanda warn bila kelompok Lebih dari 30 hari kosong", async () => {
  mockDb.update((s) => {
    const joko = customerId("Pak Joko");
    s.creditLedger = s.creditLedger.filter((e) => e.customerId === joko);
    for (const c of s.customers) c.balance = c.id === joko ? 290_000 : 0;
  });
  renderApp("/owner/kasbon");
  const card = await summaryCard();
  const groups = within(card).getAllByRole("listitem");
  expect(groups[2]).toHaveTextContent("0 pelanggan");
  expect(groups[2]?.querySelector("svg")).toBeNull();
});

test("Pelanggan urut sisa terbesar; Bu Tini pertama dengan umur dan limit", async () => {
  plantOverpaid();
  renderApp("/owner/kasbon");
  const section = await screen.findByRole("region", { name: "Pelanggan" });
  expect(within(section).getByText("urut sisa terbesar")).toBeInTheDocument();
  const rows = pelangganRows();
  const names = ["Bu Tini", "Pak Joko", "Bu Sari", "Pak Udin", "Pak Bayar"];
  expect(rows).toHaveLength(names.length);
  names.forEach((name, i) => {
    expect(rows[i]?.textContent?.startsWith(name)).toBe(true);
  });
  expect(rows[0]).toHaveTextContent("Rp640.000");
  expect(rows[0]).toHaveTextContent("45 hari · limit Rp1.000.000");
  // Umur > 30 hari: tanda ikon + teks (jam + chevron).
  expect(rows[0]?.querySelectorAll("svg")).toHaveLength(2);
  // 12 hari: tanpa tanda warn (hanya chevron).
  expect(rows[1]).toHaveTextContent("12 hari · limit Rp300.000");
  expect(rows[1]?.querySelectorAll("svg")).toHaveLength(1);
});

test("saldo 0 tidak tampil; dicari → Lunas · limit", async () => {
  const user = userEvent.setup();
  renderApp("/owner/kasbon");
  await screen.findByText("Bu Tini");
  expect(screen.queryByText("Mbak Dewi")).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("Cari nama atau nomor HP"), "dewi");
  const row = await screen.findByText("Mbak Dewi");
  expect(row.closest("li")).toHaveTextContent("Lunas · limit Rp500.000");
  expect(screen.queryByText("Bu Tini")).not.toBeInTheDocument();
});

test("Q8: saldo −40.000 tampil setelah yang berutang, Lebih bayar, tidak menambah total", async () => {
  plantOverpaid();
  renderApp("/owner/kasbon");
  await screen.findByText("Pak Bayar");
  const last = pelangganRows().at(-1);
  expect(last).toHaveTextContent("Pak Bayar");
  expect(last).toHaveTextContent("Lebih bayar Rp40.000");
  expect(last).toHaveTextContent("limit Rp300.000");
  expect(last?.textContent).not.toMatch(/hari/);
  const card = await summaryCard();
  expect(within(card).getByText("Rp1.100.000")).toBeInTheDocument();
  expect(within(card).getByText("4 pelanggan")).toBeInTheDocument();
});

test("cari nomor HP", async () => {
  const user = userEvent.setup();
  renderApp("/owner/kasbon");
  await screen.findByText("Bu Tini");
  await user.type(
    screen.getByLabelText("Cari nama atau nomor HP"),
    "081234500002",
  );
  expect(await screen.findByText("Pak Joko")).toBeInTheDocument();
  expect(screen.queryByText("Bu Tini")).not.toBeInTheDocument();
});

test("cari tanpa hasil", async () => {
  const user = userEvent.setup();
  renderApp("/owner/kasbon");
  await screen.findByText("Bu Tini");
  await user.type(screen.getByLabelText("Cari nama atau nomor HP"), "zzz");
  expect(
    await screen.findByText("Tidak ada pelanggan yang cocok"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Pelanggan" }),
  ).not.toBeInTheDocument();
});

test("klik baris → /owner/kasbon/{id}; baris ≥ 56 px", async () => {
  const user = userEvent.setup();
  const { router } = renderApp("/owner/kasbon");
  const link = await screen.findByRole("link", { name: /Bu Tini/ });
  expect(link).toHaveClass("min-h-14");
  await user.click(link);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      `/owner/kasbon/${customerId("Bu Tini")}`,
    ),
  );
});

test("tanpa pelanggan berutang → Belum ada kasbon", async () => {
  mockDb.update((s) => {
    s.creditLedger.length = 0;
    for (const c of s.customers) c.balance = 0;
  });
  renderApp("/owner/kasbon");
  expect(await screen.findByText("Belum ada kasbon")).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Pelanggan" }),
  ).not.toBeInTheDocument();
});

test("galat → pesan + Coba lagi memuat ulang", async () => {
  const user = userEvent.setup();
  server.use(
    http.get("/api/owner/customers", () =>
      HttpResponse.json(
        { code: "INTERNAL", message: "x", status: 500 },
        { status: 500 },
      ),
    ),
  );
  renderApp("/owner/kasbon");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Terjadi kesalahan di server",
  );
  server.resetHandlers();
  await user.click(screen.getByRole("button", { name: "Coba lagi" }));
  expect(await screen.findByText("Total kasbon")).toBeInTheDocument();
});

test("nominal besar di kartu total mengecil, tidak dipotong", async () => {
  stubWidth(200);
  mockDb.update((s) => {
    appendCredit(s, {
      customerId: customerId("Bu Tini"),
      amount: 123_456_789_012,
      at: Date.now(),
      saleId: null,
      paymentId: null,
    });
  });
  renderApp("/owner/kasbon");
  const card = await summaryCard();
  const total = await within(card).findByText("Rp123.457.889.012");
  expect(Number.parseFloat(total.style.fontSize)).toBeLessThan(34);
  expect(total.className).not.toMatch(/truncate|ellipsis/);
});

test("butir Beranda Kasbon > 30 hari membuka halaman ini", async () => {
  const user = userEvent.setup();
  // (K20) Contoh kejadian seed F3c-2a ditinjau agar butir ini tetap di enam baris Beranda.
  mockDb.update((s) => reviewSeedSamples(s, Date.now()));
  renderApp("/owner");
  await user.click(
    await screen.findByRole("link", { name: /^Kasbon > 30 hari/ }),
  );
  expect(await screen.findByText("Total kasbon")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 1, name: "Kasbon" }),
  ).toBeInTheDocument();
});
