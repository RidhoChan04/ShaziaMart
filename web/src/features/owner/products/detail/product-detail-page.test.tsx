import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  json,
  loginWithShift,
  ownerLogin,
  placedSales,
  post,
  saleItem,
  unitOf,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatDateLong, jakartaTime } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import { renderApp } from "@/test/render-app";

const INDOMIE = "Indomie Goreng";
const BERAS = "Beras Pandan Wangi 5 kg";
const TEH = {
  name: "Teh Pucuk Harum 350 ml",
  category: "Minuman",
  sellUnit: "botol",
  barcode: "8996001600269",
  cost: 3000,
  price: 4000,
  tier: null,
  bigUnit: null,
  minStock: null,
};

beforeEach(async () => {
  await ownerLogin();
});

const idOf = (name: string): string => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p.id;
};

const main = () => within(screen.getByRole("main"));

async function openDetail(name: string, search = "") {
  const utils = renderApp(`/owner/barang/${idOf(name)}${search}`);
  await screen.findByRole("heading", { level: 1, name });
  return utils;
}

const section = (name: string) => screen.getByRole("region", { name });
const rowWith = (scope: HTMLElement, text: string) => {
  const li = within(scope)
    .getAllByRole("listitem")
    .find((el) => el.textContent?.includes(text));
  if (!li) throw new Error(`baris "${text}" tidak ada`);
  return li;
};
const items = (scope: HTMLElement) => within(scope).getAllByRole("listitem");

async function sellIndomie(qty = 2) {
  await loginWithShift();
  const res = await post("/api/sales", {
    saleId: newId(),
    items: [saleItem(INDOMIE, { qtyBase: qty }, 3100, "pcs")],
    payments: [{ method: "cash", amount: 3100 * qty }],
    cashReceived: 3100 * qty,
    print: false,
  });
  expect(res.status).toBe(201);
}

function makeTidakDiambil(name: string, stock: number) {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === name);
    if (!p) throw new Error("seed");
    p.status = "tidak_diambil";
    p.stockCounted = true;
    s.stock[p.id] = stock;
  });
}

test("Indomie: 'Mi Instan · dijual per pcs'; Eceran · per pcs Rp3.100 'Modal Rp2.600 · untung Rp500 (19% dari modal)'; Grosir · beli 40+ pcs Rp2.800 'Modal Rp2.600 · untung Rp200 (8% dari modal)'; Dus · isi 40 pcs Rp112.000 'Modal Rp104.000 · untung Rp8.000 (8% dari modal)'", async () => {
  await openDetail(INDOMIE);
  expect(main().getByText("Mi Instan · dijual per pcs")).toBeInTheDocument();
  const harga = section("Harga");

  const eceran = rowWith(harga, "Eceran");
  expect(eceran).toHaveTextContent("Eceran · per pcs");
  expect(within(eceran).getByText("Rp3.100")).toBeInTheDocument();
  expect(
    within(eceran).getByText("Modal Rp2.600 · untung Rp500 (19% dari modal)"),
  ).toBeInTheDocument();

  const grosir = rowWith(harga, "Grosir");
  expect(grosir).toHaveTextContent("Grosir · beli 40+ pcs");
  expect(within(grosir).getByText("Rp2.800")).toBeInTheDocument();
  expect(
    within(grosir).getByText("Modal Rp2.600 · untung Rp200 (8% dari modal)"),
  ).toBeInTheDocument();

  const dus = rowWith(harga, "Dus");
  expect(dus).toHaveTextContent("Dus · isi 40 pcs");
  expect(within(dus).getByText("Rp112.000")).toBeInTheDocument();
  expect(
    within(dus).getByText("Modal Rp104.000 · untung Rp8.000 (8% dari modal)"),
  ).toBeInTheDocument();
  expect(items(harga)).toHaveLength(3);
});

test("kepala: tombol kembali 'Barang' dan 'Ubah' menuju form ubah", async () => {
  const user = userEvent.setup();
  const { router } = await openDetail(INDOMIE);
  expect(main().getByRole("link", { name: "Barang" })).toHaveAttribute(
    "href",
    "/owner/barang",
  );
  await user.click(screen.getByRole("link", { name: "Ubah" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      `/owner/barang/${idOf(INDOMIE)}/ubah`,
    ),
  );
});

test("stok: 'Batas menipis' 10 pcs; 'HPP rata-rata' Rp2.600 /pcs; barcode 089686010947 'Eceran · pcs', 189686010944 'Dus · isi 40 pcs'", async () => {
  await openDetail(INDOMIE);
  const stok = section("Stok");
  expect(
    within(stok).getByText("Batas menipis").parentElement,
  ).toHaveTextContent("10 pcs");
  expect(
    within(stok).getByText("HPP rata-rata").parentElement,
  ).toHaveTextContent("Rp2.600 /pcs");

  const barcode = section("Barcode");
  expect(rowWith(barcode, "089686010947")).toHaveTextContent("Eceran · pcs");
  expect(rowWith(barcode, "189686010944")).toHaveTextContent(
    "Dus · isi 40 pcs",
  );
});

test("Gula Pasir: 'Gula & Tepung · dijual per kg'; stok dengan koma (formatQty)", async () => {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === "Gula Pasir");
    if (!p) throw new Error("seed");
    s.stock[p.id] = 86_500;
    s.minStock[p.id] = 12_500;
  });
  await openDetail("Gula Pasir");
  expect(main().getByText("Gula & Tepung · dijual per kg")).toBeInTheDocument();
  const stok = section("Stok");
  expect(
    within(stok).getByText("Stok sekarang").parentElement,
  ).toHaveTextContent("86,5 kg");
  expect(
    within(stok).getByText("Batas menipis").parentElement,
  ).toHaveTextContent("12,5 kg");
  expect(
    within(rowWith(section("Harga"), "Eceran")).getByText("Rp18.000"),
  ).toBeInTheDocument();
});

test("barang tanpa kategori: keterangan hanya 'dijual per {satuan}'", async () => {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === "Gula Pasir");
    if (p) p.category = null;
  });
  await openDetail("Gula Pasir");
  expect(main().getByText("dijual per kg")).toBeInTheDocument();
});

test("modal null → 'Modal belum diisi' dan HPP belum diisi", async () => {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === "Gula Pasir");
    if (p) p.cost = null;
  });
  await openDetail("Gula Pasir");
  const eceran = rowWith(section("Harga"), "Eceran");
  expect(within(eceran).getByText("Modal belum diisi")).toBeInTheDocument();
  expect(within(eceran).queryByText(/untung/)).toBeNull();
  expect(
    within(section("Stok")).getByText("HPP rata-rata").parentElement,
  ).toHaveTextContent("Belum diisi");
});

test("stok di bawah batas: tanda Menipis (ikon + teks) tampil di kartu Stok", async () => {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === INDOMIE);
    if (p) s.stock[p.id] = 4;
  });
  await openDetail(INDOMIE);
  const stok = section("Stok");
  const badge = within(stok).getByText("Menipis");
  expect(badge.querySelector("svg")).not.toBeNull();
  expect(
    within(stok).getByText("Stok sekarang").parentElement,
  ).toHaveTextContent("4 pcs");
});

test("Rina jual 2 Indomie → 'Terjual 2 pcs' / 'Hari ini {HH.MM} · Kasir Rina' / '−2'; Lihat semua membuka sheet Riwayat stok", async () => {
  const user = userEvent.setup();
  await sellIndomie(2);
  const at = placedSales()[0]?.createdAt ?? 0;
  await openDetail(INDOMIE);

  const stok = section("Stok");
  const first = items(stok)[0] as HTMLElement;
  expect(first).toHaveTextContent("Terjual 2 pcs");
  expect(first).toHaveTextContent(`Hari ini ${jakartaTime(at)} · Kasir Rina`);
  expect(within(first).getByText("−2")).toBeInTheDocument();
  expect(items(stok).length).toBeLessThanOrEqual(5);

  const cardCount = items(stok).length;
  const trigger = within(stok).getByRole("button", { name: "Lihat semua" });
  await user.click(trigger);
  const sheet = await screen.findByRole("dialog", { name: "Riwayat stok" });
  const all = await within(sheet).findAllByRole("listitem");
  expect(all[0]).toHaveTextContent("Terjual 2 pcs");
  expect(all[0]).toHaveTextContent("Kasir Rina");
  expect(all.length).toBeGreaterThanOrEqual(cardCount);

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(trigger).toHaveFocus();
});

test("pembatalan penjualan tampil sebagai 'Penjualan dibatalkan 2 pcs' dengan +2", async () => {
  await sellIndomie(2);
  const sale = placedSales()[0];
  if (!sale) throw new Error("tanpa penjualan");
  mockDb.update((s) => {
    const x = s.sales.find((y) => y.id === sale.id);
    if (x) {
      x.status = "dibatalkan";
      x.voidedAt = Date.now() + 1000;
    }
  });
  await openDetail(INDOMIE);
  const first = items(section("Stok"))[0] as HTMLElement;
  expect(first).toHaveTextContent("Penjualan dibatalkan 2 pcs");
  expect(within(first).getByText("+2")).toBeInTheDocument();
});

test("riwayat harga setelah PUT prices → 'Eceran' 'Rp3.100 → Rp3.500' / '{tgl} · oleh Pemilik'", async () => {
  const res = await fetch(`/api/owner/products/${idOf(INDOMIE)}/prices`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [{ unitId: unitOf(INDOMIE).id, tierMinQty: null, price: 3500 }],
    }),
  });
  expect(res.status).toBe(200);
  await openDetail(INDOMIE);
  const row = rowWith(section("Riwayat harga"), "Rp3.100 → Rp3.500");
  expect(within(row).getByText("Eceran")).toBeInTheDocument();
  expect(
    within(row).getByText(`${formatDateLong(Date.now())} · oleh Pemilik`),
  ).toBeInTheDocument();
});

test("riwayat harga: paling banyak 10 terbaru; sumber impor → 'lewat Impor Excel'; grosir dan dus berlabel", async () => {
  const id = idOf(INDOMIE);
  const unit = unitOf(INDOMIE);
  const dus = unitOf(INDOMIE, "dus");
  mockDb.update((s) => {
    for (let i = 0; i < 12; i++) {
      s.priceHistory.push({
        id: `h${i}`,
        productId: id,
        at: Date.UTC(2026, 9, 1 + i, 3),
        unitId: unit.id,
        unitName: "pcs",
        isEceran: true,
        unitSize: 1,
        tierMinQty: null,
        oldPrice: 3000 + i,
        newPrice: 3001 + i,
        source: i === 11 ? "impor" : "pemilik",
      });
    }
    s.priceHistory.push(
      {
        id: "g",
        productId: id,
        at: Date.UTC(2026, 9, 20, 3),
        unitId: unit.id,
        unitName: "pcs",
        isEceran: true,
        unitSize: 1,
        tierMinQty: 40,
        oldPrice: 2700,
        newPrice: 2800,
        source: "pemilik",
      },
      {
        id: "d",
        productId: id,
        at: Date.UTC(2026, 9, 21, 3),
        unitId: dus.id,
        unitName: "dus",
        isEceran: false,
        unitSize: 40,
        tierMinQty: null,
        oldPrice: 110000,
        newPrice: 112000,
        source: "pemilik",
      },
    );
  });
  await openDetail(INDOMIE);
  const card = section("Riwayat harga");
  expect(items(card)).toHaveLength(10);
  expect(within(card).getByText("Grosir 40+")).toBeInTheDocument();
  expect(within(card).getByText("Dus")).toBeInTheDocument();
  expect(within(card).getByText("Rp110.000 → Rp112.000")).toBeInTheDocument();
  expect(
    within(card).getByText("12 Okt 2026 · lewat Impor Excel"),
  ).toBeInTheDocument();
  // terbaru dulu: entri tertua (1 Okt) terpotong
  expect(within(card).queryByText("Rp3.000 → Rp3.001")).toBeNull();
});

test("Status barang → Nonaktif → Simpan status → tanda Nonaktif; daftar default tidak memuatnya", async () => {
  const user = userEvent.setup();
  renderApp("/owner/barang");
  await user.click(
    await screen.findByRole("link", { name: /^Indomie Goreng Stok/ }),
  );
  await screen.findByRole("heading", { level: 1, name: INDOMIE });

  const row = screen.getByRole("button", { name: /^Status barang/ });
  expect(row).toHaveTextContent("Aktif");
  await user.click(row);
  const sheet = await screen.findByRole("dialog", { name: "Status barang" });
  expect(
    within(sheet).getByText(
      "Tetap dijual sampai habis, tanpa peringatan menipis",
    ),
  ).toBeInTheDocument();
  expect(
    within(sheet).getByText("Hilang dari pencarian kasir; riwayat tetap"),
  ).toBeInTheDocument();
  expect(within(sheet).getByRole("radio", { name: /^Aktif/ })).toBeChecked();
  await user.click(within(sheet).getByRole("radio", { name: /^Nonaktif/ }));
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan status" }),
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(
      within(screen.getByRole("list", { name: "Tanda status" })).getByText(
        "Nonaktif",
      ),
    ).toBeInTheDocument(),
  );
  const after = screen.getByRole("button", { name: /^Status barang/ });
  expect(after).toHaveTextContent("Nonaktif");
  expect(after).toHaveFocus();
  expect(mockDb.get().products.find((p) => p.name === INDOMIE)?.status).toBe(
    "nonaktif",
  );

  await user.click(screen.getByRole("button", { name: "Barang" }));
  await screen.findByRole("button", { name: /^Semua \d+$/ });
  expect(
    main().queryByRole("link", { name: /^Indomie Goreng Stok/ }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: /^Nonaktif \d+$/ }));
  expect(
    await main().findByRole("link", { name: /^Indomie Goreng Stok/ }),
  ).toBeInTheDocument();
});

test("sakelar Sedang langka → daftar menampilkan tanda Sedang langka", async () => {
  const user = userEvent.setup();
  renderApp("/owner/barang");
  await user.click(
    await screen.findByRole("link", { name: /^Indomie Goreng Stok/ }),
  );
  await screen.findByRole("heading", { level: 1, name: INDOMIE });

  const sw = screen.getByRole("switch", { name: "Sedang langka" });
  expect(sw).toHaveAttribute("aria-checked", "false");
  expect(
    screen.getByText("Peringatan stok diam sampai ada barang masuk"),
  ).toBeInTheDocument();
  await user.click(sw);
  await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  expect(mockDb.get().products.find((p) => p.name === INDOMIE)?.scarce).toBe(
    true,
  );

  await user.click(screen.getByRole("button", { name: "Barang" }));
  expect(
    await main().findByRole("link", {
      name: /^Indomie Goreng Stok.*Sedang langka/,
    }),
  ).toBeInTheDocument();
});

test("kegagalan simpan status tampil sebagai pesan dan sheet tetap terbuka", async () => {
  const user = userEvent.setup();
  await openDetail(INDOMIE);
  server.use(
    http.put("/api/owner/products/:productId/status", () =>
      HttpResponse.error(),
    ),
  );
  await user.click(screen.getByRole("button", { name: /^Status barang/ }));
  const sheet = await screen.findByRole("dialog", { name: "Status barang" });
  await user.click(within(sheet).getByRole("radio", { name: /^Nonaktif/ }));
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan status" }),
  );
  expect(await within(sheet).findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  expect(screen.getByRole("dialog", { name: "Status barang" })).toBeVisible();
  expect(mockDb.get().products.find((p) => p.name === INDOMIE)?.status).toBe(
    "aktif",
  );
});

test("barang baru tanpa penjualan: Hapus barang → konfirmasi 'Hapus Teh Pucuk Harum 350 ml?' → Hapus → kembali ke daftar, barang hilang", async () => {
  const user = userEvent.setup();
  const created = await json<OwnerProduct>(
    await post("/api/owner/products", TEH),
  );
  const { router } = renderApp("/owner/barang");
  await user.click(
    await screen.findByRole("link", { name: /^Teh Pucuk Harum 350 ml/ }),
  );
  await screen.findByRole("heading", { level: 1, name: TEH.name });
  expect(router.state.location.pathname).toBe(`/owner/barang/${created.id}`);

  const trigger = screen.getByRole("button", { name: "Hapus barang" });
  await user.click(trigger);
  const dialog = await screen.findByRole("alertdialog", {
    name: `Hapus ${TEH.name}?`,
  });
  expect(
    within(dialog).getByText(
      "Barang ini belum pernah terjual dan akan dihapus permanen.",
    ),
  ).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Batal" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(trigger).toHaveFocus();
  expect(mockDb.get().products.some((p) => p.id === created.id)).toBe(true);

  await user.click(trigger);
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Hapus",
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang"),
  );
  await screen.findByRole("button", { name: /^Semua \d+$/ });
  expect(
    main().queryByRole("link", { name: /^Teh Pucuk Harum 350 ml/ }),
  ).toBeNull();
  expect(mockDb.get().products.some((p) => p.id === created.id)).toBe(false);
});

test("hapus gagal 409 → pesan larangan tampil di dialog, barang tetap", async () => {
  const user = userEvent.setup();
  const created = await json<OwnerProduct>(
    await post("/api/owner/products", TEH),
  );
  renderApp(`/owner/barang/${created.id}`);
  await screen.findByRole("heading", { level: 1, name: TEH.name });
  // terjual setelah halaman dimuat: server menolak
  await loginWithShift();
  const sold = await post("/api/sales", {
    saleId: newId(),
    items: [saleItem(TEH.name, { qtyBase: 1 }, 4000)],
    payments: [{ method: "cash", amount: 4000 }],
    cashReceived: 4000,
    print: false,
  });
  expect(sold.status).toBe(201);
  await user.click(screen.getByRole("button", { name: "Hapus barang" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Hapus" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
  );
  expect(mockDb.get().products.some((p) => p.id === created.id)).toBe(true);
});

test("barang terjual: tanpa tombol Hapus barang; teks larangan tampil", async () => {
  await sellIndomie(1);
  await openDetail(INDOMIE);
  expect(screen.queryByRole("button", { name: "Hapus barang" })).toBeNull();
  expect(
    screen.getByText(
      "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
    ),
  ).toBeInTheDocument();
});

test("?lembar=habis pada tidak_diambil stok 0 → dialog '{nama} habis'; Biarkan aktif → status aktif, parameter lembar hilang", async () => {
  const user = userEvent.setup();
  makeTidakDiambil(BERAS, 0);
  const { router } = renderApp(`/owner/barang/${idOf(BERAS)}?lembar=habis`);
  const dialog = await screen.findByRole("alertdialog", {
    name: `${BERAS} habis`,
  });
  expect(
    within(dialog).getByText(
      "Barang ini tidak diambil lagi. Nonaktifkan agar tidak muncul di kasir, atau biarkan aktif bila ternyata hanya langka.",
    ),
  ).toBeInTheDocument();
  await user.click(
    within(dialog).getByRole("button", { name: "Biarkan aktif" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(mockDb.get().products.find((p) => p.name === BERAS)?.status).toBe(
    "aktif",
  );
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.href).not.toContain("lembar");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^Status barang/ }),
    ).toHaveTextContent("Aktif"),
  );
});

test("?lembar=habis: Nonaktifkan → status nonaktif dan parameter hilang", async () => {
  const user = userEvent.setup();
  makeTidakDiambil(BERAS, 0);
  const { router } = renderApp(`/owner/barang/${idOf(BERAS)}?lembar=habis`);
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(mockDb.get().products.find((p) => p.name === BERAS)?.status).toBe(
    "nonaktif",
  );
  expect(router.state.location.href).not.toContain("lembar");
});

test("?lembar=habis: Escape menutup dialog dan menghapus parameter tanpa mengubah status", async () => {
  const user = userEvent.setup();
  makeTidakDiambil(BERAS, 0);
  const { router } = renderApp(`/owner/barang/${idOf(BERAS)}?lembar=habis`);
  await screen.findByRole("alertdialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(router.state.location.href).not.toContain("lembar");
  expect(mockDb.get().products.find((p) => p.name === BERAS)?.status).toBe(
    "tidak_diambil",
  );
});

test("?lembar=habis diabaikan bila bukan tidak_diambil, atau stok masih ada; ?lembar=harga tidak membuka dialog habis", async () => {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === BERAS);
    if (p) s.stock[p.id] = 0;
  });
  const first = await openDetail(BERAS, "?lembar=habis");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  first.unmount();

  makeTidakDiambil(BERAS, 5);
  const second = await openDetail(BERAS, "?lembar=habis");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  second.unmount();

  makeTidakDiambil(BERAS, 0);
  await openDetail(BERAS, "?lembar=harga");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(
    within(screen.getByRole("list", { name: "Tanda status" })).getByText(
      "Tidak diambil lagi",
    ),
  ).toBeInTheDocument();
});

test("id tidak ada → 'Barang tidak ditemukan' + 'Kembali ke daftar barang'", async () => {
  renderApp("/owner/barang/tidak-ada");
  expect(await screen.findByText("Barang tidak ditemukan")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Kembali ke daftar barang" }),
  ).toHaveAttribute("href", "/owner/barang");
});
