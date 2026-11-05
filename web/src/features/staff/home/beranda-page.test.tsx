import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { createAppRouter } from "@/app/router";
import { mockDb } from "@/mocks/db";
import { get, json, staffLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { staffExpiryList } from "@/mocks/stock/expiry";
import { applySampleStock } from "@/mocks/stock/sample";
import type {
  StaffLowStockItem,
  StaffOpnameCategories,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { createTestQueryClient } from "@/test/render-app";
import { memoryDraftStore } from "../drafts/draft-store";
import { DraftStoreContext } from "../drafts/use-drafts";
import { memoryOpnameStore } from "../opname/opname-draft-store";
import { opnameDraft } from "../opname/opname-fixtures";
import { OpnameStoreContext } from "../opname/use-opname-drafts";
import { makeDraft, mockupLines } from "../receipt/form-test-kit";

/** Senin 2 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 2, 3);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockDb.update((s) => applySampleStock(s, NOW));
  await staffLogin("Rina");
});
afterEach(() => vi.useRealTimers());

const userId = (): string => {
  const u = mockDb.get().users.find((x) => x.name === "Rina");
  if (!u) throw new Error("seed tanpa Rina");
  return u.id;
};

function renderBeranda(
  stores: {
    receipts?: ReturnType<typeof memoryDraftStore>;
    opname?: ReturnType<typeof memoryOpnameStore>;
  } = {},
) {
  const queryClient = createTestQueryClient();
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ["/staff"] }),
  });
  render(
    <DraftStoreContext.Provider value={stores.receipts ?? memoryDraftStore()}>
      <OpnameStoreContext.Provider value={stores.opname ?? memoryOpnameStore()}>
        <AppProviders router={router} queryClient={queryClient} />
      </OpnameStoreContext.Provider>
    </DraftStoreContext.Provider>,
  );
  return { router };
}

const sectionOf = async (name: string | RegExp) => {
  const h = await screen.findByRole("heading", { level: 2, name });
  const wrap = h.closest("section");
  if (!wrap) throw new Error("bagian tidak ada");
  return within(wrap);
};

const lowItems = async () =>
  json<StaffLowStockItem[]>(await get("/api/staff/low-stock"));

test("dua kartu tugas: Barang masuk dan Stok opname dengan saran lingkup", async () => {
  const user = userEvent.setup();
  const categories = await json<StaffOpnameCategories>(
    await get("/api/staff/opname/categories"),
  );
  const { router } = renderBeranda();
  expect(
    await screen.findByRole("link", { name: /Barang masuk/ }),
  ).toHaveAttribute("href", "/staff/masuk/baru");
  const opname = await screen.findByRole("link", { name: /Stok opname/ });
  const label = categories.suggested?.category ?? "Tanpa kategori";
  expect(await within(opname).findByText(`Disarankan: ${label}`)).toBeVisible();
  await user.click(opname);
  expect(router.state.location.pathname).toBe("/staff/opname");
});

test("Pilih kategori bila tidak ada saran", async () => {
  server.use(
    http.get("/api/staff/opname/categories", () =>
      HttpResponse.json({ categories: [], suggested: null, allCount: 0 }),
    ),
  );
  renderBeranda();
  const opname = await screen.findByRole("link", { name: /Stok opname/ });
  expect(await within(opname).findByText("Pilih kategori")).toBeVisible();
});

test("Segera kedaluwarsa: 3 teratas dengan tanda dan Lihat semua", async () => {
  const user = userEvent.setup();
  const { router } = renderBeranda();
  const sec = await sectionOf("Segera kedaluwarsa (4)");
  const rows = sec.getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Sari Roti Tawar");
  expect(rows[0]).toHaveTextContent("±3 bungkus · ED 31 Okt");
  expect(within(rows[0] as HTMLElement).getByText("Sudah lewat")).toBeVisible();
  expect(rows[1]).toHaveTextContent("±5 bungkus · ED 4 Nov");
  expect(within(rows[1] as HTMLElement).getByText("2 hari lagi")).toBeVisible();
  await user.click(sec.getByRole("link", { name: "Lihat semua" }));
  expect(router.state.location.pathname).toBe("/staff/kedaluwarsa");
});

test("M1: tanda hari di beranda memakai 'today' dari server", async () => {
  server.use(
    http.get("/api/staff/expiry", () =>
      HttpResponse.json({
        ...staffExpiryList(mockDb.get(), Date.now()),
        today: "2026-11-03",
      }),
    ),
  );
  renderBeranda();
  const sec = await sectionOf("Segera kedaluwarsa (4)");
  const rows = sec.getAllByRole("listitem");
  expect(within(rows[1] as HTMLElement).getByText("1 hari lagi")).toBeVisible();
});

test("Stok menipis: batas dan tanda Menipis, tanpa angka sisa; Lihat semua", async () => {
  const user = userEvent.setup();
  const items = await lowItems();
  expect(items.length).toBeGreaterThan(0);
  const { router } = renderBeranda();
  const sec = await sectionOf(`Stok menipis (${items.length})`);
  const rows = sec.getAllByRole("listitem");
  expect(rows).toHaveLength(Math.min(3, items.length));
  expect(rows[0]).toHaveTextContent(items[0]?.productName ?? "?");
  expect(rows[0]).toHaveTextContent("Batas 10 pcs");
  expect(within(rows[0] as HTMLElement).getByText("Menipis")).toBeVisible();
  await user.click(sec.getByRole("link", { name: "Lihat semua" }));
  expect(router.state.location.pathname).toBe("/staff/menipis");
});

test("tanpa 'Sisa' dan tanpa Rp di beranda", async () => {
  renderBeranda();
  await screen.findByRole("heading", { level: 2, name: /Stok menipis/ });
  await screen.findByRole("heading", { level: 2, name: /Segera kedaluwarsa/ });
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/Sisa/);
  expect(text).not.toMatch(/Rp/);
});

test("Belum terkirim (2): satu draf nota dan satu draf opname antre; draf opname dibuka read-only", async () => {
  const user = userEvent.setup();
  const receipts = memoryDraftStore();
  await receipts.put({
    ...makeDraft({ supplierName: "UD Antre Jaya", lines: mockupLines() }),
    id: "d-nota",
    status: "queued",
  });
  const opname = memoryOpnameStore();
  await opname.put(opnameDraft("d-opname", { userId: userId() }));
  server.use(
    http.post("/api/staff/receipts", () => HttpResponse.error()),
    http.post("/api/staff/opname-sessions", () => HttpResponse.error()),
  );
  const { router } = renderBeranda({ receipts, opname });
  const sec = await sectionOf("Belum terkirim (2)");
  expect(sec.getByText("UD Antre Jaya")).toBeVisible();
  const row = sec.getByText("Mi Instan").closest("button") as HTMLElement;
  expect(row).toHaveTextContent("2 dari 3 dihitung");
  await user.click(row);
  expect(router.state.location.pathname).toBe("/staff/opname/hitung");
  expect(router.state.location.search).toEqual({ draf: "d-opname" });
});

test("bagian kosong tidak tampil", async () => {
  mockDb.update((s) => {
    s.minStock = {};
  });
  server.use(
    http.get("/api/staff/expiry", () =>
      HttpResponse.json({ soonDays: 30, lots: [], recent: [] }),
    ),
  );
  renderBeranda();
  const opname = await screen.findByRole("link", { name: /Stok opname/ });
  await within(opname).findByText(/Disarankan: /);
  await waitFor(() =>
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull(),
  );
});
