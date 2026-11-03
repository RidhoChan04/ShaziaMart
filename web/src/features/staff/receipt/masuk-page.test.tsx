import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { post, receiptInput } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { memoryDraftStore } from "../drafts/draft-store";
import {
  DRAFT_ID,
  loginRina,
  makeDraft,
  mockupLines,
  NOW,
  renderForm,
} from "./form-test-kit";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** Wi-Fi putus tepat saat kirim nota: POST gagal di jaringan, bagian lain normal. */
const wifiPutus = () =>
  server.use(http.post("/api/staff/receipts", () => HttpResponse.error()));

const queued = (id: string, supplier: string) => ({
  ...makeDraft({ supplierName: supplier, lines: mockupLines() }),
  id,
  status: "queued" as const,
});

const rejected = (id: string, supplier: string) => ({
  ...queued(id, supplier),
  status: "rejected" as const,
  errors: [
    { lineId: "l1", field: "qty" as const, message: "Jumlah minimal 1" },
  ],
});

test("offline: draf antre 'Belum terkirim' tetap antre, 'Perlu dibetulkan' dan 'Draf' di bagiannya, total dari draf", async () => {
  await loginRina(true);
  const store = memoryDraftStore();
  await store.put(queued("d-antre", "UD Antre Jaya"));
  await store.put(rejected("d-tolak", "PT Ditolak"));
  await store.put({
    ...makeDraft({ supplierName: "", lines: [] }),
    id: "d-isi",
  });
  wifiPutus();
  renderForm(store, "/staff/masuk");

  const antre = (await screen.findByText("UD Antre Jaya")).closest("button");
  expect(
    within(antre as HTMLElement).getByText("Belum terkirim"),
  ).toBeVisible();
  expect(within(antre as HTMLElement).getByText("Rp1.442.000")).toBeVisible();
  const tolak = screen.getByText("PT Ditolak").closest("button");
  expect(
    within(tolak as HTMLElement).getByText("Perlu dibetulkan"),
  ).toBeVisible();
  const isi = screen.getByText("Tanpa supplier").closest("button");
  expect(within(isi as HTMLElement).queryByText("Belum terkirim")).toBeNull();
  for (const name of ["Belum terkirim", "Draf"]) {
    expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
  }
  expect((await store.get("d-antre"))?.status).toBe("queued");
});

test("online: nota server di 'Terkirim' dengan ringkasan dan total; judul besar 'Barang masuk'", async () => {
  await loginRina(true);
  expect((await post("/api/staff/receipts", receiptInput())).status).toBe(201);
  renderForm(memoryDraftStore(), "/staff/masuk");
  const sent = (await screen.findByText("CV Sumber Rejeki")).closest("button");
  expect(
    screen.getByRole("heading", { level: 2, name: "Terkirim" }),
  ).toBeVisible();
  expect(
    within(sent as HTMLElement).getByText("2 Nov 2026 · 3 barang"),
  ).toBeVisible();
  expect(within(sent as HTMLElement).getByText("Rp1.442.000")).toBeVisible();
  expect(
    screen.getByRole("heading", { level: 1, name: "Barang masuk" }),
  ).toBeVisible();
});

test("draf antre terkirim otomatis saat tab dibuka: pindah ke 'Terkirim', draf di HP hilang", async () => {
  await loginRina(true);
  const store = memoryDraftStore();
  await store.put(queued("d-antre", "UD Antre Jaya"));
  renderForm(store, "/staff/masuk");
  expect(await screen.findByText("UD Antre Jaya")).toBeVisible();
  await waitFor(async () => expect(await store.list()).toEqual([]));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { level: 2, name: "Terkirim" }),
    ).toBeVisible(),
  );
  expect(screen.getByText("UD Antre Jaya")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Belum terkirim" })).toBeNull();
});

test("draf milik pengguna lain tidak tampil", async () => {
  await loginRina(true);
  const store = memoryDraftStore();
  await store.put({ ...queued("d-budi", "Milik Budi"), userId: "bukan-rina" });
  renderForm(store, "/staff/masuk");
  expect(await screen.findByText("Belum ada barang masuk")).toBeVisible();
  expect(screen.queryByText("Milik Budi")).toBeNull();
});

test("kosong → 'Belum ada barang masuk' dan tombol 'Catat barang masuk' ke form baru", async () => {
  await loginRina(true);
  const { router } = renderForm(memoryDraftStore(), "/staff/masuk");
  expect(await screen.findByText("Belum ada barang masuk")).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("link", { name: "Catat barang masuk" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk/baru"),
  );
});

test("ketuk draf → form dengan ?draf=; ketuk nota → /staff/masuk/{id}", async () => {
  await loginRina(true);
  await post("/api/staff/receipts", receiptInput());
  const store = memoryDraftStore();
  await store.put(rejected("d-tolak", "PT Ditolak"));
  const { router } = renderForm(store, "/staff/masuk");
  const user = userEvent.setup();
  await user.click(await screen.findByText("PT Ditolak"));
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ draf: "d-tolak" }),
  );
  await router.navigate({ to: "/staff/masuk" });
  await user.click(await screen.findByText("CV Sumber Rejeki"));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk/draf-1"),
  );
});

test("nota yang dibatalkan diberi tanda 'Dibatalkan'", async () => {
  await loginRina(true);
  await post("/api/staff/receipts", receiptInput());
  mockDb.update((s) => {
    for (const r of s.receipts) r.status = "dibatalkan";
  });
  renderForm(memoryDraftStore(), "/staff/masuk");
  const row = (await screen.findByText("CV Sumber Rejeki")).closest("button");
  expect(within(row as HTMLElement).getByText("Dibatalkan")).toBeVisible();
});

test("Beranda: 'Belum terkirim (1)' berisi draf antre; draf yang sedang diisi tidak dihitung", async () => {
  await loginRina(true);
  const store = memoryDraftStore();
  await store.put(queued("d-antre", "UD Antre Jaya"));
  await store.put(makeDraft());
  wifiPutus();
  renderForm(store, "/staff");
  expect(
    await screen.findByRole("heading", { name: "Belum terkirim (1)" }),
  ).toBeInTheDocument();
  expect(screen.getByText("UD Antre Jaya")).toBeVisible();
  expect(DRAFT_ID).toBeTruthy();
});
