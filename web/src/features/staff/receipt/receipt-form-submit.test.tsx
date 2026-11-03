import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import { memoryDraftStore } from "../drafts/draft-store";
import {
  capturePosts,
  DRAFT_ID,
  loginRina,
  makeDraft,
  mockupLines,
  NOW,
  renderForm,
  seedLine,
  storeWithDraft,
} from "./form-test-kit";

const BAYAR = `/staff/masuk/baru?draf=${DRAFT_ID}&langkah=bayar`;
const RECEIPTS = "/api/staff/receipts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  toast.dismiss();
  server.events.removeAllListeners();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("Simpan: PUT foto lalu POST (dueDate null); toast 'Barang masuk tersimpan'; ke daftar; draf hilang", async () => {
  await loginRina(true);
  const order: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const { pathname } = new URL(request.url);
    if (request.method === "PUT" || request.method === "POST") {
      if (pathname.startsWith("/api/staff/"))
        order.push(`${request.method} ${pathname}`);
    }
  });
  const store = memoryDraftStore();
  const draft = makeDraft({
    lines: mockupLines(),
    supplierName: "CV Sumber Rejeki",
  });
  await store.put({
    ...draft,
    photo: {
      id: "foto-uji",
      blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], {
        type: "image/jpeg",
      }),
      takenAt: NOW,
      bytes: 5,
      uploaded: false,
    },
  });
  const bodies = capturePosts();
  const { router } = renderForm(store, BAYAR);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Simpan barang masuk" }),
  );
  expect(await screen.findByText("Barang masuk tersimpan")).toBeInTheDocument();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
  expect(order.slice(0, 2)).toEqual([
    "PUT /api/staff/receipt-photos/foto-uji",
    `POST ${RECEIPTS}`,
  ]);
  expect(bodies[0]).toMatchObject({
    id: DRAFT_ID,
    photoId: "foto-uji",
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    payment: {
      timing: "sekarang",
      method: "tunai",
      cashSource: "laci",
      dueDate: null,
    },
  });
  expect(await store.list()).toEqual([]);
  expect(mockDb.get().receipts.some((r) => r.id === DRAFT_ID)).toBe(true);
});

test("server mati → toast 'Belum terkirim — dikirim otomatis saat tersambung'; draf 'queued'; ke daftar", async () => {
  await loginRina(true);
  const store = await storeWithDraft();
  const { router } = renderForm(store, BAYAR);
  const user = userEvent.setup();
  const save = await screen.findByRole("button", {
    name: "Simpan barang masuk",
  });
  setScenario("server-mati");
  await user.click(save);
  expect(
    await screen.findByText(
      "Belum terkirim — dikirim otomatis saat tersambung",
    ),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
  expect((await store.get(DRAFT_ID))?.status).toBe("queued");
});

test("422 Bimoli nonaktif → kembali ke langkah nota, 'Barang ini tidak dijual lagi' di bawah baris Bimoli; toast 'Perlu dibetulkan — lihat pesan di baris'", async () => {
  await loginRina(true);
  const store = await storeWithDraft();
  const { router } = renderForm(store, BAYAR);
  const user = userEvent.setup();
  const save = await screen.findByRole("button", {
    name: "Simpan barang masuk",
  });
  mockDb.update((s) => {
    for (const p of s.products)
      if (p.name === "Minyak Goreng Bimoli 2 L") p.status = "nonaktif";
  });
  await user.click(save);
  expect(
    await screen.findByText("Perlu dibetulkan — lihat pesan di baris"),
  ).toBeInTheDocument();
  const row = screen.getByText("Minyak Goreng Bimoli 2 L").closest("div");
  expect(row).not.toBeNull();
  const message = await screen.findByText("Barang ini tidak dijual lagi");
  expect(row?.contains(message)).toBe(true);
  expect(router.state.location.search).not.toHaveProperty("langkah");
  expect((await store.get(DRAFT_ID))?.status).toBe("rejected");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Lanjut ke pembayaran" }),
    ).toBeEnabled(),
  );
});

test("Simpan diklik dua kali cepat → satu POST", async () => {
  await loginRina(true);
  const bodies = capturePosts();
  renderForm(await storeWithDraft(), BAYAR);
  const user = userEvent.setup();
  const save = await screen.findByRole("button", {
    name: "Simpan barang masuk",
  });
  await Promise.all([user.click(save), user.click(save)]);
  await screen.findByText("Barang masuk tersimpan");
  expect(bodies).toHaveLength(1);
});

test("galat tulis HP saat Simpan → tetap di form dengan pesan galat, tidak ada POST", async () => {
  await loginRina(true);
  const bodies = capturePosts();
  const base = await storeWithDraft();
  const store = {
    ...base,
    put: vi.fn().mockRejectedValue(new Error("kuota penuh")),
  };
  const { router } = renderForm(store, BAYAR);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Simpan barang masuk" }),
  );
  expect(
    await screen.findByText(/Gagal menyimpan draf di HP/),
  ).toBeInTheDocument();
  expect(bodies).toHaveLength(0);
  expect(router.state.location.pathname).toBe("/staff/masuk/baru");
  expect(
    screen.getByRole("button", { name: "Simpan barang masuk" }),
  ).toBeEnabled();
});

test("barang baru (nama bukan di seed) ikut terkirim dan tampil bertanda 'Barang baru'", async () => {
  await loginRina(true);
  const bodies = capturePosts();
  const newLine = {
    ...seedLine("lb", "Indomie Goreng", "pcs", 1, "3.000"),
    product: null,
    unitId: null,
    newProduct: {
      name: "Teh Pucuk Harum 350 ml",
      sellUnit: "botol",
      notaUnit: "dus",
      notaUnitSize: "24",
      barcode: "",
    },
  };
  renderForm(
    await storeWithDraft({
      lines: [newLine],
      supplierName: "CV Sumber Rejeki",
    }),
  );
  const user = userEvent.setup();
  expect(await screen.findByText("Barang baru")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Lanjut ke pembayaran" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Simpan barang masuk" }),
  );
  await screen.findByText("Barang masuk tersimpan");
  expect(bodies[0]).toMatchObject({
    lines: [
      { newProduct: { name: "Teh Pucuk Harum 350 ml", notaUnitSize: 24 } },
    ],
  });
});
