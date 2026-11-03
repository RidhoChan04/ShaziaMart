import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { formatRupiah } from "@/shared/lib/money";
import { unitCost } from "@/shared/lib/product-rules";
import { renderApp } from "@/test/render-app";
import { receiveTeh, seedReceipt, TEH_NAME } from "@/test/seed-receipts";

const INDOMIE = "Indomie Goreng";
const TEH = "Teh Pucuk Harum 350 ml";
const PROBLEM = { "Content-Type": "application/problem+json" };

beforeEach(async () => {
  await ownerLogin();
});

const idOf = (name: string): string => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p.id;
};

const region = (name: string | RegExp) => screen.getByRole("region", { name });
const field = (label: string, scope?: HTMLElement) =>
  (scope ? within(scope) : screen).getByLabelText(label);
const save = () => screen.getByRole("button", { name: "Simpan" });
const options = (el: HTMLElement) =>
  Array.from((el as HTMLInputElement).list?.options ?? []).map((o) => o.value);

/** Catat request tulis (bukan GET); berhenti mendengar lewat `stop`. */
function countWrites() {
  const seen: string[] = [];
  const onStart = ({ request }: { request: Request }) => {
    if (request.method !== "GET") seen.push(`${request.method} ${request.url}`);
  };
  server.events.on("request:start", onStart);
  return {
    seen,
    stop: () => server.events.removeListener("request:start", onStart),
  };
}

async function openNew() {
  const user = userEvent.setup();
  const utils = renderApp("/owner/barang/baru");
  await screen.findByRole("heading", { level: 1, name: "Barang baru" });
  return { user, ...utils };
}

async function openEdit(name: string) {
  const user = userEvent.setup();
  const utils = renderApp(`/owner/barang/${idOf(name)}/ubah`);
  await screen.findByRole("heading", { level: 1, name: "Ubah barang" });
  await waitFor(() => expect(field("Nama")).toHaveValue(name));
  return { user, ...utils };
}

type User = ReturnType<typeof userEvent.setup>;

async function fillTeh(user: User) {
  await user.type(field("Nama"), TEH);
  await user.type(field("Kategori"), "Minuman");
  await user.type(field("Dijual per"), "botol");
  const eceran = region("Eceran");
  await user.type(field("Barcode", eceran), "8996001600269");
  await user.type(field("Harga modal", eceran), "3000");
  await user.type(field("Harga jual", eceran), "4000");
}

test("tambah Teh Pucuk lengkap → petunjuk dan simpan", async () => {
  const { user } = await openNew();
  await fillTeh(user);
  expect(
    screen.getByText("Untung Rp1.000 (33% dari modal) per botol"),
  ).toBeInTheDocument();

  const grosir = region(/^Grosir/);
  await user.type(field("Beli minimal", grosir), "12");
  await user.type(field("Harga per botol", grosir), "3750");
  expect(
    within(grosir).getByText("Untung Rp750 (25% dari modal) per botol"),
  ).toBeInTheDocument();

  const besar = region(/^Satuan besar/);
  await user.type(field("Satuan", besar), "dus");
  await user.type(field("Isi", besar), "24");
  await user.type(field("Harga modal", besar), "70000");
  await user.type(field("Harga jual", besar), "84000");

  const eceran = region("Eceran");
  expect(
    within(eceran).getByText("Dihitung dari modal dus: Rp2.917"),
  ).toBeInTheDocument();
  expect(within(eceran).queryByLabelText("Harga modal")).toBeNull();
  expect(
    within(eceran).getByText("Untung Rp1.083 (37% dari modal) per botol"),
  ).toBeInTheDocument();
  expect(
    within(grosir).getByText("Untung Rp833 (29% dari modal) per botol"),
  ).toBeInTheDocument();
  expect(
    within(besar).getByText(
      "Untung Rp14.000 (20% dari modal) per dus · setara Rp3.500 per botol",
    ),
  ).toBeInTheDocument();

  await user.type(field("Ingatkan bila stok di bawah"), "24");
  await user.click(save());

  expect(
    await screen.findByRole("heading", { level: 1, name: TEH }),
  ).toBeInTheDocument();
  const saved = mockDb.get().products.find((p) => p.name === TEH);
  expect(saved?.cost).toEqual({ amount: 70000, qtyBase: 24 });
  expect(saved?.units.map((u) => [u.name, u.unitSize, u.price])).toEqual([
    ["botol", 1, 4000],
    ["dus", 24, 84000],
  ]);
});

test("Simpan kosong → tiga pesan terhubung ke isian, fokus ke yang pertama, tanpa request", async () => {
  const { user } = await openNew();
  const writes = countWrites();
  await user.click(save());

  const nama = field("Nama");
  const dijual = field("Dijual per");
  const jual = field("Harga jual", region("Eceran"));
  expect(nama).toHaveAccessibleDescription("Nama barang belum diisi");
  expect(dijual).toHaveAccessibleDescription("'Dijual per' belum diisi");
  expect(jual).toHaveAccessibleDescription("Harga jual belum diisi");
  for (const el of [nama, dijual, jual]) {
    expect(el).toHaveAttribute("aria-invalid", "true");
  }
  expect(field("Kategori")).not.toHaveAttribute("aria-invalid", "true");
  expect(nama).toHaveFocus();
  expect(writes.seen).toEqual([]);
  writes.stop();

  // Pesan hilang begitu isian diperbaiki.
  await user.type(nama, "Teh");
  expect(nama).not.toHaveAttribute("aria-invalid", "true");
  expect(nama).toHaveAccessibleDescription("");
});

test("fokus ke isian salah pertama menurut urutan form, bukan urutan pesan", async () => {
  const { user } = await openNew();
  const eceran = region("Eceran");
  await user.type(field("Nama"), "Teh");
  await user.type(field("Dijual per"), "botol");
  await user.type(field("Harga modal", eceran), "3000");
  await user.type(field("Harga jual", eceran), "4000");
  await user.type(field("Beli minimal", region(/^Grosir/)), "12");
  await user.click(save());
  const harga = field("Harga per botol", region(/^Grosir/));
  // Pesan "isi 'beli minimal' dan harganya" dipasang di baris Beli minimal.
  expect(field("Beli minimal", region(/^Grosir/))).toHaveAccessibleDescription(
    "Grosir: isi 'beli minimal' dan harganya",
  );
  expect(field("Beli minimal", region(/^Grosir/))).toHaveFocus();
  expect(harga).not.toHaveAttribute("aria-invalid", "true");
});

test("harga jual 2500 modal 3000 → 'Harga jual di bawah modal (Rp3.000)'", async () => {
  const { user } = await openNew();
  const eceran = region("Eceran");
  await user.type(field("Nama"), "Teh");
  await user.type(field("Dijual per"), "botol");
  await user.type(field("Harga modal", eceran), "3000");
  await user.type(field("Harga jual", eceran), "2500");
  await user.click(save());
  expect(field("Harga jual", eceran)).toHaveAccessibleDescription(
    "Harga jual di bawah modal (Rp3.000)",
  );
  expect(field("Harga jual", eceran)).toHaveFocus();
});

test("angka tak terbaca → 'Harga jual: ketik angka saja, mis. 3500'", async () => {
  const { user } = await openNew();
  await user.type(field("Nama"), "Teh");
  await user.type(field("Dijual per"), "botol");
  await user.type(field("Harga jual", region("Eceran")), "empat ribu");
  await user.click(save());
  expect(field("Harga jual", region("Eceran"))).toHaveAccessibleDescription(
    "Harga jual: ketik angka saja, mis. 3500",
  );
});

test("barcode 089686010947 → error server 'Barcode sudah dipakai: Indomie Goreng' di bawah Barcode", async () => {
  const { user } = await openNew();
  const eceran = region("Eceran");
  await user.type(field("Nama"), "Mie Lain");
  await user.type(field("Dijual per"), "pcs");
  await user.type(field("Barcode", eceran), "089686010947");
  await user.type(field("Harga jual", eceran), "3500");
  await user.click(save());

  const barcode = field("Barcode", eceran);
  await waitFor(() =>
    expect(barcode).toHaveAccessibleDescription(
      "Barcode sudah dipakai: Indomie Goreng",
    ),
  );
  expect(barcode).toHaveAttribute("aria-invalid", "true");
  expect(barcode).toHaveFocus();
  expect(save()).toBeEnabled();
  expect(mockDb.get().products.some((p) => p.name === "Mie Lain")).toBe(false);
});

test("422 dari server dipetakan ke isian; fokus ke yang pertama menurut urutan form", async () => {
  server.use(
    http.post("/api/owner/products", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Unprocessable",
          status: 422,
          code: "VALIDATION",
          errors: [
            {
              field: "bigBarcode",
              message: "Barcode satuan besar sudah dipakai",
            },
            { field: "tierPrice", message: "Harga grosir harus lebih murah" },
          ],
        },
        { status: 422, headers: PROBLEM },
      ),
    ),
  );
  const { user } = await openNew();
  await fillTeh(user);
  await user.click(save());
  const grosirHarga = field("Harga per botol", region(/^Grosir/));
  await waitFor(() =>
    expect(grosirHarga).toHaveAccessibleDescription(
      "Harga grosir harus lebih murah",
    ),
  );
  expect(field("Barcode", region(/^Satuan besar/))).toHaveAccessibleDescription(
    "Barcode satuan besar sudah dipakai",
  );
  expect(grosirHarga).toHaveFocus();
});

test("gagal jaringan → pesan umum, isian utuh, tombol aktif lagi", async () => {
  server.use(http.post("/api/owner/products", () => HttpResponse.error()));
  const { user } = await openNew();
  await fillTeh(user);
  await user.click(save());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  expect(field("Nama")).toHaveValue(TEH);
  expect(save()).toBeEnabled();
});

test("409 dari server → pesan ditampilkan, isian utuh", async () => {
  server.use(
    http.post("/api/owner/products", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          code: "PRODUCT_HAS_SALES",
        },
        { status: 409, headers: PROBLEM },
      ),
    ),
  );
  const { user } = await openNew();
  await fillTeh(user);
  await user.click(save());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
  );
  expect(field("Nama")).toHaveValue(TEH);
  expect(save()).toBeEnabled();
});

test("tombol nonaktif selama menunggu server", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/owner/products", async () => {
      await gate;
      return HttpResponse.error();
    }),
  );
  const { user } = await openNew();
  await fillTeh(user);
  await user.click(save());
  const pending = await screen.findByRole("button", { name: "Menyimpan…" });
  expect(pending).toBeDisabled();
  release();
  await waitFor(() => expect(save()).toBeEnabled());
});

test("ubah Indomie (terjual): Dijual per & Isi dus disabled dengan keterangan; harga jual 3200 → detail Rp3.200", async () => {
  const { user } = await openEdit(INDOMIE);
  const locked = "Tidak bisa diubah — barang sudah terjual";
  const dijual = field("Dijual per");
  expect(dijual).toBeDisabled();
  expect(dijual).toHaveAccessibleDescription(locked);
  const besar = region(/^Satuan besar/);
  expect(field("Satuan", besar)).toHaveValue("dus");
  expect(field("Isi", besar)).toBeDisabled();
  expect(field("Isi", besar)).toHaveAccessibleDescription(locked);

  const harga = field("Harga jual", region("Eceran"));
  await user.clear(harga);
  await user.type(harga, "3200");
  await user.click(save());
  expect(
    await screen.findByRole("heading", { level: 1, name: INDOMIE }),
  ).toBeInTheDocument();
  await waitFor(() => expect(region("Harga")).toHaveTextContent("Rp3.200"));
});

test("barang belum terjual tapi punya stok: Dijual per terkunci dengan 'Tidak bisa diubah — barang sudah punya stok'", async () => {
  const res = await post("/api/owner/products", {
    name: TEH,
    category: "Minuman",
    sellUnit: "botol",
    barcode: null,
    cost: 3000,
    price: 4000,
    tier: null,
    bigUnit: null,
    minStock: null,
  });
  expect(res.status).toBe(201);
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === TEH);
    if (!p) throw new Error("tanpa Teh");
    s.stock[p.id] = 6;
    p.stockCounted = true;
  });
  await openEdit(TEH);
  const dijual = field("Dijual per");
  expect(dijual).toBeDisabled();
  expect(dijual).toHaveAccessibleDescription(
    "Tidak bisa diubah — barang sudah punya stok",
  );
});

test("422 untuk isian terkunci (tidak bisa difokus) → pesannya juga tampil di peringatan; fokus ke isian salah yang bisa diubah", async () => {
  server.use(
    http.put("/api/owner/products/:id", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Unprocessable",
          status: 422,
          code: "VALIDATION",
          errors: [
            {
              field: "sellUnit",
              message: "'Dijual per' tidak bisa diubah — barang sudah terjual",
            },
            { field: "price", message: "Harga jual di bawah modal (Rp2.600)" },
          ],
        },
        { status: 422, headers: PROBLEM },
      ),
    ),
  );
  const { user } = await openEdit(INDOMIE);
  await user.click(save());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "'Dijual per' tidak bisa diubah — barang sudah terjual",
  );
  const harga = field("Harga jual", region("Eceran"));
  await waitFor(() => expect(harga).toHaveFocus());
  expect(harga).toHaveAccessibleDescription(
    "Harga jual di bawah modal (Rp2.600)",
  );
});

test("Hapus satuan besar mengosongkan bagian; modal terhitung jadi modal eceran", async () => {
  const { user } = await openEdit(INDOMIE);
  const besar = region(/^Satuan besar/);
  const eceran = region("Eceran");
  expect(
    within(eceran).getByText("Dihitung dari modal dus: Rp2.600"),
  ).toBeInTheDocument();
  await user.click(
    within(besar).getByRole("button", { name: "Hapus satuan besar" }),
  );
  expect(field("Satuan", besar)).toHaveValue("");
  expect(field("Isi", besar)).toHaveValue("");
  expect(field("Harga modal", eceran)).toHaveValue("Rp2.600");
  await user.click(save());
  await screen.findByRole("heading", { level: 1, name: INDOMIE });
  const p = mockDb.get().products.find((x) => x.name === INDOMIE);
  expect(p?.units.filter((u) => u.active)).toHaveLength(1);
  expect(p?.cost).toEqual({ amount: 2600, qtyBase: 1 });
});

test("kategori baru 'Frozen Food' tersimpan dan muncul di datalist", async () => {
  const { user } = await openNew();
  await user.type(field("Nama"), "Nugget Ayam");
  await user.type(field("Kategori"), "Frozen Food");
  await user.type(field("Dijual per"), "bungkus");
  await user.type(field("Harga jual", region("Eceran")), "25000");
  await user.click(save());
  await screen.findByRole("heading", { level: 1, name: "Nugget Ayam" });
  expect(mockDb.get().categories).toContain("Frozen Food");

  await user.click(screen.getByRole("link", { name: "Ubah" }));
  await screen.findByRole("heading", { level: 1, name: "Ubah barang" });
  await waitFor(() => expect(field("Nama")).toHaveValue("Nugget Ayam"));
  await waitFor(() =>
    expect(options(field("Kategori"))).toContain("Frozen Food"),
  );
});

test("pilihan satuan kecil dan besar ada di datalist", async () => {
  await openNew();
  expect(options(field("Dijual per"))).toEqual([
    "pcs",
    "bungkus",
    "buah",
    "botol",
    "kaleng",
    "sachet",
    "butir",
    "kg",
    "ons",
    "liter",
  ]);
  expect(options(field("Satuan", region(/^Satuan besar/)))).toEqual([
    "dus",
    "slop",
    "renceng",
    "pak",
    "lusin",
    "karton",
    "bal",
    "karung",
    "krat",
  ]);
});

test("kg: batas '2,5' diterima → minStock 2500", async () => {
  const { user } = await openNew();
  await user.type(field("Nama"), "Gula Curah");
  await user.type(field("Dijual per"), "kg");
  await user.type(field("Harga jual", region("Eceran")), "16000");
  await user.type(field("Ingatkan bila stok di bawah"), "2,5");
  await user.click(save());
  await screen.findByRole("heading", { level: 1, name: "Gula Curah" });
  const p = mockDb.get().products.find((x) => x.name === "Gula Curah");
  expect(p && mockDb.get().minStock[p.id]).toBe(2500);
});

test("klik Simpan dua kali cepat → satu POST", async () => {
  const { user } = await openNew();
  await fillTeh(user);
  const writes = countWrites();
  await user.dblClick(save());
  await screen.findByRole("heading", { level: 1, name: TEH });
  expect(writes.seen.filter((s) => s.startsWith("POST"))).toHaveLength(1);
  writes.stop();
  expect(mockDb.get().products.filter((p) => p.name === TEH)).toHaveLength(1);
});

test("dua submit dalam satu tarikan napas (sebelum layar sempat diperbarui) → tetap satu POST", async () => {
  const { user } = await openNew();
  await fillTeh(user);
  const writes = countWrites();
  const form = save().closest("form");
  if (!form) throw new Error("tanpa form");
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await screen.findByRole("heading", { level: 1, name: TEH });
  expect(writes.seen.filter((s) => s.startsWith("POST"))).toHaveLength(1);
  writes.stop();
});

test("Batal saat tambah → daftar barang, tanpa request", async () => {
  const { user } = await openNew();
  await user.type(field("Nama"), "Tidak jadi");
  const writes = countWrites();
  await user.click(screen.getByRole("link", { name: "Batal" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Barang" }),
  ).toBeInTheDocument();
  expect(writes.seen).toEqual([]);
  writes.stop();
});

test("Batal saat ubah → detail barang, tanpa request, harga tak berubah", async () => {
  const { user } = await openEdit(INDOMIE);
  const harga = field("Harga jual", region("Eceran"));
  await user.clear(harga);
  await user.type(harga, "9999");
  const writes = countWrites();
  await user.click(screen.getByRole("link", { name: "Batal" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: INDOMIE }),
  ).toBeInTheDocument();
  expect(writes.seen).toEqual([]);
  writes.stop();
  expect(
    mockDb.get().products.find((p) => p.name === INDOMIE)?.units[0]?.price,
  ).toBe(3100);
});

test("barang tidak ditemukan saat ubah", async () => {
  renderApp("/owner/barang/tidak-ada/ubah");
  expect(
    await screen.findByRole("heading", { name: "Barang tidak ditemukan" }),
  ).toBeInTheDocument();
});

test("bagian, label, catatan, dan inputmode persis sesuai spec", async () => {
  await openNew();
  const names = within(screen.getByRole("main"))
    .getAllByRole("region")
    .map((r) => r.getAttribute("aria-labelledby"))
    .map((id) => (id ? document.getElementById(id)?.textContent : null));
  expect(names).toEqual([
    "Barang",
    "Eceran",
    "Grosir opsional",
    "Satuan besar opsional",
    "Batas stok menipis",
  ]);
  const eceran = region("Eceran");
  const grosir = region(/^Grosir/);
  const besar = region(/^Satuan besar/);
  const labelled: [string, HTMLElement | undefined][] = [
    ["Nama", undefined],
    ["Kategori", undefined],
    ["Dijual per", undefined],
    ["Barcode", eceran],
    ["Harga modal", eceran],
    ["Harga jual", eceran],
    ["Beli minimal", grosir],
    ["Harga per satuan", grosir],
    ["Satuan", besar],
    ["Isi", besar],
    ["Barcode", besar],
    ["Harga modal", besar],
    ["Harga jual", besar],
    ["Ingatkan bila stok di bawah", undefined],
  ];
  for (const [label, scope] of labelled) {
    expect(field(label, scope)).toBeInstanceOf(HTMLInputElement);
  }
  expect(
    within(besar).getByRole("button", { name: "Hapus satuan besar" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Satuan terkecil yang dijual kasir. Barang timbang: pilih kg, ons, atau liter.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Barang muncul di "Perlu perhatian" di Beranda.'),
  ).toBeInTheDocument();
  for (const [label, scope] of [
    ["Harga modal", eceran],
    ["Harga jual", eceran],
    ["Harga modal", besar],
    ["Harga jual", besar],
    ["Harga per satuan", grosir],
  ] as const) {
    expect(field(label, scope)).toHaveAttribute("inputmode", "numeric");
  }
});

test("barang menunggu harga jual: 'Harga jual' kosong dan wajib; isi 4.000 & dus 90.000 → Simpan → detail tanpa tanda, harga terisi", async () => {
  await receiveTeh();
  const { user } = await openEdit(TEH_NAME);
  expect(field("Harga jual", region("Eceran"))).toHaveValue("");
  expect(field("Harga jual", region(/^Satuan besar/))).toHaveValue("");

  await user.click(save());
  expect(
    await screen.findByText(/Harga jual/, { selector: "#pf-price-error" }),
  ).toBeInTheDocument();
  expect(mockDb.get().products.find((p) => p.name === TEH_NAME)?.status).toBe(
    "menunggu_harga",
  );

  await user.type(field("Harga jual", region("Eceran")), "4000");
  await user.type(field("Harga jual", region(/^Satuan besar/)), "90000");
  await user.click(save());
  await screen.findByRole("heading", { level: 1, name: TEH_NAME });
  const product = mockDb.get().products.find((p) => p.name === TEH_NAME);
  expect(product?.status).toBe("aktif");
  expect(screen.queryByText("Menunggu harga jual")).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Harga" })).getByText("Rp4.000"),
  ).toBeInTheDocument();
});

test("Indomie setelah barang masuk: 'Harga modal' eceran & satuan besar nonaktif, bernilai modal sekarang, dengan 'Mengikuti barang masuk'; menyimpan harga jual tetap bisa", async () => {
  await seedReceipt();
  const { user } = await openEdit(INDOMIE);
  const eceran = field("Harga modal", region("Eceran"));
  const besar = field("Harga modal", region(/^Satuan besar/));
  expect(eceran).toBeDisabled();
  expect(besar).toBeDisabled();
  // Modal sekarang = HPP dari barang masuk (bukan seed), per pcs dan per dus isi 40.
  const cost = mockDb.get().products.find((p) => p.name === INDOMIE)?.cost;
  if (!cost) throw new Error("HPP Indomie hilang");
  expect(eceran).toHaveValue(formatRupiah(unitCost(cost, 1) ?? 0));
  expect(besar).toHaveValue(formatRupiah(unitCost(cost, 40) ?? 0));
  expect(eceran).toHaveAccessibleDescription("Mengikuti barang masuk");
  expect(besar).toHaveAccessibleDescription("Mengikuti barang masuk");

  const price = field("Harga jual", region("Eceran"));
  await user.clear(price);
  await user.type(price, "3200");
  await user.click(save());
  await screen.findByRole("heading", { level: 1, name: INDOMIE });
  // Menyimpan tidak menggeser HPP dari barang masuk (K16).
  expect(mockDb.get().products.find((p) => p.name === INDOMIE)?.cost).toEqual(
    cost,
  );
  expect(
    within(screen.getByRole("region", { name: "Harga" })).getByText("Rp3.200"),
  ).toBeInTheDocument();
});

test("barang tanpa barang masuk: 'Harga modal' tetap bisa diisi", async () => {
  await openEdit(INDOMIE);
  expect(field("Harga modal", region(/^Satuan besar/))).toBeEnabled();
});
