import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { get, json } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { installCamera } from "@/test/camera";
import type { OpnameDraft } from "./opname-draft-types";
import { opnameDraft, opnameStoreWith } from "./opname-fixtures";
import {
  loginStaff,
  MI_INSTAN,
  renderOpname,
  staffId,
  T,
} from "./opname-test-kit";

const INDOMIE = "Indomie Goreng";
const INDOMIE_PCS = "089686010947";

let products: StaffProduct[] = [];
const names = () => products.map((p) => p.name);
const idOf = (name: string) => {
  const p = products.find((x) => x.name === name);
  if (!p) throw new Error(`tanpa ${name}`);
  return p.id;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T("10.30"));
  await loginStaff();
  products = await json<StaffProduct[]>(
    await get(
      `/api/staff/opname/products?lingkup=kategori&kategori=${encodeURIComponent("Mi Instan")}`,
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  server.events.removeAllListeners();
  setScenario("normal");
});

function countingDraft(patch: Partial<OpnameDraft> = {}): OpnameDraft {
  return opnameDraft("draf-uji", {
    userId: staffId(),
    status: "counting",
    scope: MI_INSTAN,
    products,
    counts: {},
    ...patch,
  });
}

async function open(patch: Partial<OpnameDraft> = {}, camera = true) {
  const cam = camera ? installCamera() : undefined;
  const store = await opnameStoreWith(countingDraft(patch));
  const utils = renderOpname("/staff/opname/hitung?draf=draf-uji", store);
  await screen.findByRole("heading", { level: 1, name: "Mi Instan" });
  return { ...utils, cam, store };
}

const stored = async (store: {
  get(id: string): Promise<OpnameDraft | undefined>;
}) => {
  const d = await store.get("draf-uji");
  if (!d) throw new Error("draf hilang");
  return d;
};
const todo = () => screen.getByRole("region", { name: /^Belum dihitung/ });
const done = () => screen.getByRole("region", { name: /^Sudah dihitung/ });
const card = () => screen.getByRole("region", { name: "Sedang dihitung" });
const scanButton = () => screen.getByRole("button", { name: "Scan barcode" });
const press = (
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
) => user.click(screen.getByRole("button", { name }));

test("hitung buta: tanpa angka stok di layar dan tanpa meminta stok ke server", async () => {
  mockDb.update((s) => {
    s.stock[idOf(INDOMIE)] = 987;
  });
  const paths: string[] = [];
  server.events.on("request:start", ({ request }) =>
    paths.push(`${request.method} ${new URL(request.url).pathname}`),
  );
  const user = userEvent.setup();
  await open();
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  expect(document.body.textContent).not.toContain("987");
  expect(
    screen.getByText("Stok sistem disembunyikan sampai selesai"),
  ).toBeVisible();
  expect(
    paths.filter((p) => /opname-sessions|\/products|stock/.test(p)),
  ).toEqual([]);
});

test("kepala: Jeda, judul lingkup, '0 dari n', Scan barcode dan Cari; daftar belum dihitung", async () => {
  await open();
  expect(screen.getByRole("button", { name: "Jeda" })).toBeVisible();
  expect(screen.getByText(`0 dari ${products.length}`)).toBeVisible();
  expect(scanButton()).toBeVisible();
  expect(screen.getByRole("button", { name: "Cari" })).toBeVisible();
  expect(
    screen.getByRole("region", { name: `Belum dihitung ${products.length}` }),
  ).toBeVisible();
  expect(screen.queryByRole("region", { name: /^Sudah dihitung/ })).toBeNull();
  expect(screen.queryByRole("region", { name: "Sedang dihitung" })).toBeNull();
});

test("scan barcode di salinan → kartu 'Ter-scan 10.42'; fokus kembali ke Scan barcode", async () => {
  const user = userEvent.setup();
  const { cam } = await open();
  await user.click(scanButton());
  vi.setSystemTime(T("10.42"));
  if (cam) cam.state.detections = [INDOMIE_PCS];
  await waitFor(() => expect(card()).toBeVisible());
  expect(within(card()).getByText("Ter-scan 10.42")).toBeVisible();
  expect(within(card()).getByRole("heading", { name: INDOMIE })).toBeVisible();
  expect(within(card()).getByText("Sedang dihitung")).toBeVisible();
  await waitFor(() => expect(scanButton()).toHaveFocus());
});

test("scanner ditutup tanpa hasil (Batal) → fokus kembali ke Scan barcode", async () => {
  const user = userEvent.setup();
  await open();
  await user.click(scanButton());
  await user.click(await screen.findByRole("button", { name: "Batal" }));
  await waitFor(() => expect(scanButton()).toHaveFocus());
  expect(screen.queryByRole("region", { name: "Sedang dihitung" })).toBeNull();
});

test("barcode di luar lingkup → 'Barang ini tidak ada di Mi Instan', tanpa kartu", async () => {
  const outsider = mockDb
    .get()
    .products.find(
      (p) => p.category !== "Mi Instan" && p.units.some((u) => u.barcodes[0]),
    );
  const code = outsider?.units.find((u) => u.barcodes[0])?.barcodes[0];
  if (!code) throw new Error("seed tanpa barang lain");
  const user = userEvent.setup();
  const { cam } = await open();
  await user.click(scanButton());
  if (cam) cam.state.detections = [code];
  expect(
    await screen.findByText("Barang ini tidak ada di Mi Instan"),
  ).toBeVisible();
  expect(screen.queryByRole("region", { name: "Sedang dihitung" })).toBeNull();
  await waitFor(() => expect(scanButton()).toHaveFocus());
});

test("dus + pcs → 'Jumlah fisik = 125 pcs' → simpan → masuk 'Sudah dihitung' (125 pcs), barang berikutnya terbuka, fokus ke Scan barcode", async () => {
  const user = userEvent.setup();
  const { store } = await open();
  vi.setSystemTime(T("10.20"));
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  expect(within(card()).getByText("Dibuka 10.20")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await user.click(screen.getByRole("button", { name: "Tambah Dus" }));
  }
  for (let i = 0; i < 5; i++) {
    await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  }
  expect(screen.getByText("= 125 pcs")).toBeVisible();
  await press(user, "Simpan, lanjut barang berikutnya");

  await waitFor(() => expect(done()).toBeVisible());
  expect(within(done()).getByText(INDOMIE)).toBeVisible();
  expect(within(done()).getByText("125 pcs")).toBeVisible();
  expect(screen.getByText(`1 dari ${products.length}`)).toBeVisible();
  // Barang belum-dihitung berikutnya (urut nama) terbuka.
  const at = names().indexOf(INDOMIE);
  const next = names()[(at + 1) % names().length] ?? "";
  expect(within(card()).getByRole("heading", { name: next })).toBeVisible();
  await waitFor(() => expect(scanButton()).toHaveFocus());
  const d = await stored(store);
  expect(d.counts[idOf(INDOMIE)]).toEqual({
    qtyBase: 125,
    countedAt: T("10.20"),
  });
  expect(d.status).toBe("counting");
});

test("muat ulang halaman → hitungan masih ada", async () => {
  const user = userEvent.setup();
  const first = await open();
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(() => expect(done()).toBeVisible());
  first.unmount();

  renderOpname("/staff/opname/hitung?draf=draf-uji", first.store);
  await screen.findByRole("heading", { level: 1, name: "Mi Instan" });
  await waitFor(() => expect(done()).toBeVisible());
  expect(within(done()).getByText("1 pcs")).toBeVisible();
});

test("countedAt = jam saat barang dibuka; dibuka ulang → jamnya diperbarui", async () => {
  const user = userEvent.setup();
  const { store } = await open();
  vi.setSystemTime(T("10.20"));
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  vi.setSystemTime(T("10.50"));
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(() => expect(done()).toBeVisible());
  expect((await stored(store)).counts[idOf(INDOMIE)]?.countedAt).toBe(
    T("10.20"),
  );

  vi.setSystemTime(T("11.05"));
  await user.click(
    within(done()).getByRole("button", { name: /Indomie Goreng/ }),
  );
  expect(within(card()).getByText("Dibuka 11.05")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(async () =>
    expect((await stored(store)).counts[idOf(INDOMIE)]).toEqual({
      qtyBase: 2,
      countedAt: T("11.05"),
    }),
  );
});

test("Cari: lembar 'Cari nama barang' menyaring salinan daftar; pilihan membuka kartu 'Dibuka'", async () => {
  const user = userEvent.setup();
  await open({}, false);
  expect(screen.queryByRole("button", { name: "Scan barcode" })).toBeNull();
  await press(user, "Cari");
  const input = await screen.findByRole("searchbox", {
    name: "Cari nama barang",
  });
  expect(input).toHaveAttribute("placeholder", "Cari nama barang");
  const other = names().find((n) => n !== INDOMIE) ?? "";
  await user.type(input, other.slice(0, 5));
  vi.setSystemTime(T("10.33"));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: other }));
  expect(within(card()).getByText("Dibuka 10.33")).toBeVisible();
  expect(within(card()).getByRole("heading", { name: other })).toBeVisible();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Jeda → kembali ke tab, draf tetap", async () => {
  const user = userEvent.setup();
  const { store, router } = await open({
    counts: { [idOf(INDOMIE)]: { qtyBase: 4, countedAt: T("10.00") } },
  });
  await press(user, "Jeda");
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname"),
  );
  expect((await stored(store)).counts[idOf(INDOMIE)]?.qtyBase).toBe(4);
});

test("Selesai menghitung dengan sisa → dialog; 'Lanjut menghitung' menutup; konfirmasi → terkirim → halaman hasil", async () => {
  const user = userEvent.setup();
  const { router, store } = await open({
    counts: { [idOf(INDOMIE)]: { qtyBase: 125, countedAt: T("10.00") } },
  });
  await press(user, "Selesai menghitung");
  const left = products.length - 1;
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Selesai sekarang?")).toBeVisible();
  expect(
    within(dialog).getByText(
      `${left} barang belum dihitung dan tidak ikut dicatat.`,
    ),
  ).toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "Lanjut menghitung" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(router.state.location.pathname).toBe("/staff/opname/hitung");

  await press(user, "Selesai menghitung");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Selesai menghitung",
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/draf-uji"),
  );
  expect(await screen.findByText("Hitungan terkirim")).toBeVisible();
  expect(mockDb.get().opnameSessions.map((s) => s.id)).toContain("draf-uji");
  expect(await store.get("draf-uji")).toBeUndefined();
});

test("I1: 'Lanjut menghitung' / Esc di dialog → fokus kembali ke Scan barcode", async () => {
  const user = userEvent.setup();
  await open({
    counts: { [idOf(INDOMIE)]: { qtyBase: 125, countedAt: T("10.00") } },
  });
  await press(user, "Selesai menghitung");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Lanjut menghitung",
    }),
  );
  await waitFor(() => expect(scanButton()).toHaveFocus());

  await press(user, "Buang hitungan");
  await screen.findByRole("alertdialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await waitFor(() => expect(scanButton()).toHaveFocus());
});

test("I1: tanpa kamera → fokus kembali ke 'Selesai menghitung'", async () => {
  const user = userEvent.setup();
  await open(
    { counts: { [idOf(INDOMIE)]: { qtyBase: 125, countedAt: T("10.00") } } },
    false,
  );
  await press(user, "Selesai menghitung");
  await screen.findByRole("alertdialog");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Selesai menghitung" }),
    ).toHaveFocus(),
  );
});

test("semua barang sudah dihitung → Selesai menghitung tanpa dialog", async () => {
  const user = userEvent.setup();
  const counts = Object.fromEntries(
    products.map((p) => [p.id, { qtyBase: 100, countedAt: T("10.00") }]),
  );
  const { router } = await open({ counts });
  await press(user, "Selesai menghitung");
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/draf-uji"),
  );
});

test("offline: Selesai menghitung → antre, toast 'Belum terkirim — dikirim otomatis saat tersambung', kembali ke tab; draf queued", async () => {
  const user = userEvent.setup();
  const { router, store, queryClient } = await open({
    counts: { [idOf(INDOMIE)]: { qtyBase: 125, countedAt: T("10.00") } },
  });
  setScenario("server-mati");
  await queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() });
  await press(user, "Selesai menghitung");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Selesai menghitung",
    }),
  );
  expect(
    await screen.findByText(
      "Belum terkirim — dikirim otomatis saat tersambung",
    ),
  ).toBeVisible();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname"),
  );
  expect((await stored(store)).status).toBe("queued");

  // Draf antre hanya bisa dibaca; satu-satunya aksi: Buang hitungan.
  const rows = await screen.findByRole("region", { name: "Sedang dihitung" });
  expect(rows).toHaveTextContent("Belum terkirim");
  await user.click(within(rows).getAllByRole("button")[0] as HTMLElement);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/hitung"),
  );
  await screen.findByText(INDOMIE);
  expect(screen.queryByRole("button", { name: "Scan barcode" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cari" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Simpan, lanjut barang berikutnya" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Selesai menghitung" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Buang hitungan" })).toBeVisible();
});

test("Buang hitungan → dialog → draf hilang, kembali ke tab", async () => {
  const user = userEvent.setup();
  const { store, router } = await open({
    counts: { [idOf(INDOMIE)]: { qtyBase: 4, countedAt: T("10.00") } },
  });
  await press(user, "Buang hitungan");
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Buang hitungan ini?")).toBeVisible();
  expect(
    within(dialog).getByText("Hitungan Mi Instan di HP ini akan dihapus."),
  ).toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "Lanjut menghitung" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(await store.get("draf-uji")).toBeDefined();

  await press(user, "Buang hitungan");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Buang hitungan",
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname"),
  );
  expect(await store.get("draf-uji")).toBeUndefined();
});

test("draf ditolak: pesan per barang + 'Hapus hitungan'; bisa dikirim ulang", async () => {
  const user = userEvent.setup();
  const gone = idOf(INDOMIE);
  const { store, queryClient } = await open({
    status: "rejected",
    counts: {
      [gone]: { qtyBase: 4, countedAt: T("10.00") },
      [idOf(names().find((n) => n !== INDOMIE) ?? "")]: {
        qtyBase: 9,
        countedAt: T("10.01"),
      },
    },
    errors: [
      { productId: gone, message: "Barang ini tidak dijual lagi" },
      { productId: null, message: "Jam hitung tidak valid" },
    ],
  });
  expect(screen.getByText("Barang ini tidak dijual lagi")).toBeVisible();
  expect(screen.getByText("Jam hitung tidak valid")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Hapus hitungan" }));
  await waitFor(async () =>
    expect((await stored(store)).counts[gone]).toBeUndefined(),
  );
  expect(screen.queryByText("Barang ini tidak dijual lagi")).toBeNull();

  setScenario("server-mati");
  await queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() });
  await press(user, "Selesai menghitung");
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Selesai menghitung",
    }),
  );
  await waitFor(async () =>
    expect((await stored(store)).status).toBe("queued"),
  );
  expect((await stored(store)).errors).toEqual([]);
});

test("draf tidak ada → pesan dan tombol kembali", async () => {
  renderOpname("/staff/opname/hitung?draf=tidak-ada");
  expect(await screen.findByText("Hitungan tidak ditemukan")).toBeVisible();
  expect(screen.getByRole("button", { name: "Kembali" })).toBeVisible();
});

test("barang di kartu tetap bisa dicatat 0 (nol sah)", async () => {
  const user = userEvent.setup();
  const { store } = await open();
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(async () =>
    expect((await stored(store)).counts[idOf(INDOMIE)]?.qtyBase).toBe(0),
  );
  expect(within(done()).getByText("0 pcs")).toBeVisible();
});

test("pindah barang saat jumlah sudah diubah → jumlah tersimpan dengan jam bukanya; yang belum diubah tidak", async () => {
  const user = userEvent.setup();
  const { store } = await open();
  const other = names().find((n) => n !== INDOMIE) ?? "";
  vi.setSystemTime(T("10.20"));
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  vi.setSystemTime(T("10.25"));
  await user.click(within(todo()).getByRole("button", { name: other }));
  await waitFor(async () =>
    expect((await stored(store)).counts[idOf(INDOMIE)]).toEqual({
      qtyBase: 1,
      countedAt: T("10.20"),
    }),
  );
  // Kartu `other` dibuka tapi tidak diubah: pindah lagi tidak mencatatnya.
  await user.click(
    within(done()).getByRole("button", { name: /Indomie Goreng/ }),
  );
  expect((await stored(store)).counts[idOf(other)]).toBeUndefined();
});

test("Jeda menyimpan jumlah yang sudah diubah tetapi belum disimpan", async () => {
  const user = userEvent.setup();
  const { store, router } = await open();
  vi.setSystemTime(T("10.20"));
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  await press(user, "Jeda");
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname"),
  );
  expect((await stored(store)).counts[idOf(INDOMIE)]).toEqual({
    qtyBase: 1,
    countedAt: T("10.20"),
  });
});

test("kartu yang dibuka otomatis setelah simpan: jam dicap saat interaksi pertama, bukan saat dibuka", async () => {
  const user = userEvent.setup();
  const { store } = await open();
  vi.setSystemTime(T("10.20"));
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  vi.setSystemTime(T("10.30"));
  await press(user, "Simpan, lanjut barang berikutnya");
  const at = names().indexOf(INDOMIE);
  const next = names()[(at + 1) % names().length] ?? "";
  await waitFor(() =>
    expect(within(card()).getByRole("heading", { name: next })).toBeVisible(),
  );
  expect(within(card()).queryByText(/^Dibuka/)).toBeNull();
  vi.setSystemTime(T("10.40"));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  expect(within(card()).getByText("Dibuka 10.40")).toBeVisible();
  vi.setSystemTime(T("10.50"));
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(async () =>
    expect((await stored(store)).counts[idOf(next)]).toEqual({
      qtyBase: 1,
      countedAt: T("10.40"),
    }),
  );
});

test("diubah lalu dikembalikan (+ lalu −) tidak tersimpan otomatis sebagai 0; Simpan eksplisit tetap menyimpan", async () => {
  const user = userEvent.setup();
  const { store, router } = await open();
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  await user.click(screen.getByRole("button", { name: "Kurangi Pcs" }));
  await press(user, "Jeda");
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname"),
  );
  expect((await stored(store)).counts[idOf(INDOMIE)]).toBeUndefined();
});

test("Simpan eksplisit pada kartu yang tidak diubah menyimpan 0", async () => {
  const user = userEvent.setup();
  const { store } = await open();
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  await user.click(screen.getByRole("button", { name: "Kurangi Pcs" }));
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(async () =>
    expect((await stored(store)).counts[idOf(INDOMIE)]?.qtyBase).toBe(0),
  );
});

test("gagal menulis ke HP: peringatan tampil dan Jeda tidak pindah halaman", async () => {
  const user = userEvent.setup();
  const { store, router } = await open();
  await user.click(within(todo()).getByRole("button", { name: INDOMIE }));
  await user.click(screen.getByRole("button", { name: "Tambah Pcs" }));
  vi.spyOn(store, "put").mockRejectedValue(new Error("penuh"));
  await press(user, "Jeda");
  expect(
    await screen.findByText(/Hitungan tidak bisa disimpan di HP/),
  ).toBeVisible();
  expect(router.state.location.pathname).toBe("/staff/opname/hitung");
});

test("barang curah: isian kg → gram di draf dan 'Jumlah fisik = 1,5 kg'", async () => {
  const user = userEvent.setup();
  const gula: StaffProduct = {
    id: "p-gula-uji",
    name: "Gula Curah Uji",
    category: "Mi Instan",
    isCurah: true,
    baseUnit: "gram",
    status: "aktif",
    units: [{ id: "u-kg", name: "kg", unitSize: 1000, barcodes: [] }],
  };
  const { store } = await open({ products: [gula, ...products] });
  await user.click(
    within(todo()).getByRole("button", { name: "Gula Curah Uji" }),
  );
  await user.type(screen.getByLabelText("Berat (kg)"), "1,5");
  expect(screen.getByText("= 1,5 kg")).toBeVisible();
  await press(user, "Simpan, lanjut barang berikutnya");
  await waitFor(async () =>
    expect((await stored(store)).counts["p-gula-uji"]?.qtyBase).toBe(1500),
  );
  expect(within(done()).getByText("1,5 kg")).toBeVisible();
});
