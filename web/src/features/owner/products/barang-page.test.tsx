import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { renderApp } from "@/test/render-app";

beforeEach(async () => {
  await ownerLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** ResizeObserver palsu yang langsung melaporkan lebar tertentu saat observe(). */
function stubWidth(width: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        this.cb(
          [{ contentRect: { width } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    },
  );
}

const main = () => within(screen.getByRole("main"));

async function openBarang(path = "/owner/barang") {
  const utils = renderApp(path);
  await screen.findByRole("button", { name: /^Semua \d+$/ });
  return utils;
}

const listRow = (name: string) => {
  const link = main().getByRole("link", { name: new RegExp(`^${name} Stok`) });
  return within(link);
};

test("halaman: judul besar Barang; Indomie 'Rp3.100/pcs'; chip 'Semua 60'; chip 'Mi Instan {n}' menyaring", async () => {
  const user = userEvent.setup();
  renderApp("/owner/barang");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Barang" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "Semua 60" }),
  ).toBeInTheDocument();
  expect(
    listRow("Indomie Goreng").getByText("Rp3.100/pcs"),
  ).toBeInTheDocument();

  const miInstan = mockDb
    .get()
    .products.filter(
      (p) => p.category === "Mi Instan" && p.status !== "nonaktif",
    ).length;
  expect(miInstan).toBeGreaterThan(1);
  const chip = screen.getByRole("button", { name: `Mi Instan ${miInstan}` });
  await user.click(chip);
  expect(chip).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect(
      main().getAllByRole("link", { name: /Stok|belum dihitung/ }),
    ).toHaveLength(miInstan),
  );
  expect(main().queryByText("Minyak Goreng Bimoli 2 L")).toBeNull();
  expect(main().getByText("Indomie Goreng")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Semua 60" }));
  await waitFor(() =>
    expect(main().getByText("Minyak Goreng Bimoli 2 L")).toBeInTheDocument(),
  );
});

test("tanda Menipis tampil dengan ikon aria-hidden + teks; barang belum dihitung menampilkan 'Stok belum dihitung' tanpa angka", async () => {
  mockDb.update((s) => {
    const bimoli = s.products.find(
      (p) => p.name === "Minyak Goreng Bimoli 2 L",
    );
    const gula = s.products.find((p) => p.name === "Gula Pasir");
    if (!bimoli || !gula) throw new Error("seed berubah");
    s.stock[bimoli.id] = 4;
    s.minStock[bimoli.id] = 6;
    gula.stockCounted = false;
  });
  await openBarang();

  const bimoli = listRow("Minyak Goreng Bimoli 2 L");
  const badge = bimoli.getByText("Menipis");
  expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(badge).toHaveClass("bg-warning-soft", "text-warning-ink");

  const gula = listRow("Gula Pasir");
  expect(gula.getByText("Stok belum dihitung")).toBeInTheDocument();
  expect(gula.queryByText(/^Stok \d/)).toBeNull();
});

test("Menu lainnya: action sheet berisi Impor dari Excel (ke /owner/barang/impor) dan Unduh template Excel (href /templates/data-barang.xlsx, download)", async () => {
  const user = userEvent.setup();
  const { router } = await openBarang();

  await user.click(screen.getByRole("button", { name: "Menu lainnya" }));
  const sheet = await screen.findByRole("dialog", { name: "Menu lainnya" });
  const template = within(sheet).getByRole("link", {
    name: "Unduh template Excel",
  });
  expect(template).toHaveAttribute("href", "/templates/data-barang.xlsx");
  expect(template).toHaveAttribute("download", "data-barang.xlsx");
  expect(sheet).toHaveClass("bottom-0");
  expect(
    within(sheet).getByRole("button", { name: "Batal" }),
  ).toBeInTheDocument();

  await user.click(
    within(sheet).getByRole("link", { name: "Impor dari Excel" }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang/impor"),
  );
});

test("Menu lainnya: Esc dan Batal menutup sheet dan mengembalikan fokus ke pemicu", async () => {
  const user = userEvent.setup();
  await openBarang();
  const trigger = screen.getByRole("button", { name: "Menu lainnya" });
  await user.click(trigger);
  await screen.findByRole("dialog", { name: "Menu lainnya" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(trigger).toHaveFocus();

  await user.click(trigger);
  await user.click(await screen.findByRole("button", { name: "Batal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(trigger).toHaveFocus();
});

test("Tambah barang menuju /owner/barang/baru; kolom cari berlabel", async () => {
  const user = userEvent.setup();
  const { router } = await openBarang();
  expect(
    screen.getByRole("searchbox", { name: "Cari nama atau barcode" }),
  ).toHaveAttribute("placeholder", "Cari nama atau barcode");
  await user.click(screen.getByRole("link", { name: "Tambah barang" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang/baru"),
  );
});

test("cari & kategori di URL: buka detail lalu kembali → filter tetap", async () => {
  const user = userEvent.setup();
  const { router } = await openBarang(
    "/owner/barang?q=indomie&kategori=Mi%20Instan",
  );
  const search = screen.getByRole("searchbox", {
    name: "Cari nama atau barcode",
  });
  expect(search).toHaveValue("indomie");
  expect(
    screen.getByRole("button", { name: /^Mi Instan \d+$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const shown = main().getAllByRole("link", { name: /Indomie/ });

  await user.click(shown[0] as HTMLElement);
  await waitFor(() =>
    expect(router.state.location.pathname).toMatch(/^\/owner\/barang\/.+/),
  );
  // Sub-halaman memakai tombol kembali di header-nya.
  await user.click(await screen.findByRole("button", { name: "Barang" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang"),
  );
  expect(router.state.location.search).toEqual({
    q: "indomie",
    kategori: "Mi Instan",
  });
  expect(
    await screen.findByRole("searchbox", { name: "Cari nama atau barcode" }),
  ).toHaveValue("indomie");
  expect(main().getAllByRole("link", { name: /Indomie/ })).toHaveLength(
    shown.length,
  );
});

test("mengetik di kolom cari menyaring dan menulis ?q= ke URL", async () => {
  const user = userEvent.setup();
  const { router } = await openBarang();
  await user.type(
    screen.getByRole("searchbox", { name: "Cari nama atau barcode" }),
    "bimoli",
  );
  await waitFor(() =>
    expect(
      main().getAllByRole("link", { name: /Stok|belum dihitung/ }),
    ).toHaveLength(1),
  );
  expect(router.state.location.search).toEqual({ q: "bimoli" });
});

test("kosong → 'Tidak ada barang yang cocok'", async () => {
  const user = userEvent.setup();
  await openBarang();
  await user.type(
    screen.getByRole("searchbox", { name: "Cari nama atau barcode" }),
    "zzzxxyy",
  );
  expect(
    await screen.findByText("Tidak ada barang yang cocok"),
  ).toBeInTheDocument();
});

test("chip Nonaktif hanya ada bila ada barang nonaktif, dan menampilkan hanya yang nonaktif", async () => {
  const user = userEvent.setup();
  const first = await openBarang();
  expect(screen.queryByRole("button", { name: /^Nonaktif/ })).toBeNull();
  first.unmount();

  mockDb.update((s) => {
    const gula = s.products.find((p) => p.name === "Gula Pasir");
    if (!gula) throw new Error("seed berubah");
    gula.status = "nonaktif";
  });
  await openBarang();
  const chip = await screen.findByRole("button", { name: "Nonaktif 1" });
  expect(screen.getByRole("button", { name: "Semua 59" })).toBeInTheDocument();
  await user.click(chip);
  await waitFor(() =>
    expect(
      main().getAllByRole("link", { name: /Stok|belum dihitung/ }),
    ).toHaveLength(1),
  );
  expect(listRow("Gula Pasir").getByText("Nonaktif")).toBeInTheDocument();
});

test("sub-halaman /owner/barang/baru tidak menampilkan judul besar 'Barang' dari kerangka", async () => {
  renderApp("/owner/barang/baru");
  await screen.findByRole("heading", { level: 1, name: "Segera hadir" });
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(
    screen.queryByRole("heading", { level: 1, name: "Barang" }),
  ).toBeNull();
  // Tab Barang tetap ditandai aktif.
  expect(
    within(
      screen.getByRole("navigation", { name: "Navigasi utama" }),
    ).getByRole("link", { name: "Barang" }),
  ).toHaveAttribute("aria-current", "page");
});

test("sub-halaman dibuka langsung (tanpa riwayat): kembali = tautan ke /owner/barang", async () => {
  renderApp("/owner/barang/baru");
  await screen.findByRole("heading", { level: 1, name: "Segera hadir" });
  const back = main().getByRole("link", { name: "Barang" });
  expect(back).toHaveAttribute("href", "/owner/barang");
});

test("harga baris mengecil bertahap (FitAmount), tidak dipotong", async () => {
  // Lebar daftar 300 → kolom harga floor((300 - 60) x 0,38) = 91px.
  stubWidth(300);
  await openBarang();
  const price = listRow("Indomie Goreng").getByText("Rp3.100/pcs");
  expect(price.style.fontSize).toBe("13px");
  expect(price).not.toHaveClass("truncate");
});

test("daftar barang punya role=list eksplisit (Safari membuang semantik ul tanpa bullet)", async () => {
  await openBarang();
  const list = main().getByRole("list");
  expect(list.tagName).toBe("UL");
  expect(list).toHaveAttribute("role", "list");
});

test("Menu lainnya dengan keyboard: Tab ke pemicu, Enter, Tab ke Impor dari Excel, Enter → navigasi", async () => {
  const user = userEvent.setup();
  const { router } = await openBarang();
  const trigger = screen.getByRole("button", { name: "Menu lainnya" });
  for (let i = 0; i < 10 && document.activeElement !== trigger; i++)
    await user.tab();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Enter}");
  const sheet = await screen.findByRole("dialog", { name: "Menu lainnya" });
  const impor = within(sheet).getByRole("link", { name: "Impor dari Excel" });
  for (let i = 0; i < 5 && document.activeElement !== impor; i++)
    await user.tab();
  expect(impor).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang/impor"),
  );
});

test("chip Nonaktif tetap tampil dan tertekan saat ?nonaktif=true walau jumlahnya 0", async () => {
  await openBarang("/owner/barang?nonaktif=true");
  const chip = screen.getByRole("button", { name: "Nonaktif 0" });
  expect(chip).toHaveAttribute("aria-pressed", "true");
  expect(
    await screen.findByText("Tidak ada barang yang cocok"),
  ).toBeInTheDocument();
});

test("kolom cari ikut berubah saat ?q= di URL berubah tanpa remount", async () => {
  const { router } = await openBarang("/owner/barang?q=indomie");
  const search = screen.getByRole("searchbox", {
    name: "Cari nama atau barcode",
  });
  expect(search).toHaveValue("indomie");
  await router.navigate({ to: "/owner/barang", search: { q: "bimoli" } });
  await waitFor(() => expect(search).toHaveValue("bimoli"));
  await router.navigate({ to: "/owner/barang" });
  await waitFor(() => expect(search).toHaveValue(""));
});
