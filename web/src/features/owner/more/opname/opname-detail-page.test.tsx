import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";
import {
  BERAS5,
  countOf,
  INDOMIE,
  idOf,
  KOPI,
  seedOpname,
  setCost,
  submitCount,
  T,
} from "@/test/seed-opname";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await seedOpname();
  await ownerLogin();
  vi.setSystemTime(T("14.05"));
});

afterEach(() => vi.useRealTimers());

const section = (name: string) => screen.getByRole("region", { name });
const rowOf = (name: string) => {
  const li = screen
    .getAllByRole("listitem")
    .find((el) => el.textContent?.includes(name));
  if (!li) throw new Error(`baris ${name} tidak ada`);
  return li;
};

test("ringkasan, bagian berurutan, dan isi baris", async () => {
  renderApp("/owner/lainnya/opname/A");
  await screen.findByRole("heading", { level: 1, name: "Mi Instan" });
  expect(screen.getByText("Rina · 5 Nov 2026 10.00")).toBeVisible();
  expect(
    within(screen.getByRole("main")).getByRole("link", {
      name: /Hasil opname/,
    }),
  ).toHaveAttribute("href", "/owner/lainnya/opname");
  const summary = screen.getByRole("region", { name: "Ringkasan selisih" });
  expect(summary).toHaveTextContent("KurangRp224.000");
  expect(summary).toHaveTextContent("LebihRp36.000");
  expect(summary).toHaveTextContent("4 barang dihitung · 3 selisih");

  const headings = screen
    .getAllByRole("heading", { level: 2 })
    .map((h) => h.textContent);
  expect(headings).toEqual(["Menunggu persetujuan", "Selisih", "Cocok"]);

  const held = section("Menunggu persetujuan");
  const indomie = within(held).getByText(INDOMIE).closest("li");
  expect(indomie).toHaveTextContent("Sistem 60 pcs → hitungan 20 pcs");
  expect(indomie).toHaveTextContent("Kurang 40 pcs");
  expect(indomie).toHaveTextContent("Rp104.000");
  expect(indomie).toHaveTextContent(
    "Salah input sebelumnya · nota CV Sumber Rejeki 3 Nov · dihitung 10.00",
  );
  expect(within(held).getByText(KOPI).closest("li")).toHaveTextContent(
    "Rp120.000",
  );

  const diff = section("Selisih");
  expect(
    within(diff)
      .getByText(/Bimoli/)
      .closest("li"),
  ).toHaveTextContent("Lebih 1 pcs");
  expect(
    within(diff)
      .getByText(/Bimoli/)
      .closest("li"),
  ).toHaveTextContent("Rp36.000");
  expect(within(diff).queryByRole("button", { name: /Setujui/ })).toBeNull();
  const cocok = section("Cocok");
  expect(within(cocok).getByText(BERAS5)).toBeVisible();
  expect(within(cocok).queryByText(/Rp/)).toBeNull();
});

test("banner selisih besar; 'Tandai sudah ditinjau' -> 'Ditinjau {nama} · Hari ini 14.05'", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/opname/A");
  expect(
    await screen.findByText("Total selisih Rp260.000 melewati batas Rp250.000"),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Tandai sudah ditinjau" }),
  );
  expect(
    await screen.findByText("Ditinjau Pak Ahmad · Hari ini 14.05"),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Tandai sudah ditinjau" }),
  ).toBeNull();
  expect(
    mockDb.get().opnameSessions.find((s) => s.id === "A")?.reviewedAt,
  ).toBe(T("14.05"));
});

test("tanpa HPP: baris 'HPP belum ada' dan tetap ditahan", async () => {
  setCost(BERAS5, null);
  vi.setSystemTime(T("11.00"));
  await submitCount("B", { kind: "kategori", category: "Beras" }, [
    countOf(BERAS5, 8, "11.00"),
  ]);
  const res = await post("/api/staff/opname-sessions/B/finish", {
    reasons: [{ productId: idOf(BERAS5), reason: "hilang", receiptId: null }],
  });
  expect(res.status).toBe(200);
  renderApp("/owner/lainnya/opname/B");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  expect(within(held).getByText("HPP belum ada")).toBeVisible();
  expect(screen.queryByText(/melewati batas/)).toBeNull();
});

test("Setujui: dialog -> baris pindah dengan 'Disetujui {nama} · Hari ini 14.05'", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  await user.click(
    within(held).getByRole("button", { name: `Setujui ${INDOMIE}` }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: "Setujui selisih ini?",
  });
  expect(dialog).toHaveTextContent("Stok Indomie Goreng disesuaikan −40 pcs.");
  await user.click(within(dialog).getByRole("button", { name: "Setujui" }));

  expect(
    await screen.findByText("Disetujui Pak Ahmad · Hari ini 14.05"),
  ).toBeVisible();
  expect(
    within(section("Menunggu persetujuan")).queryByText(INDOMIE),
  ).toBeNull();
  expect(within(section("Selisih")).getByText(INDOMIE)).toBeVisible();
  expect(mockDb.get().stock[idOf(INDOMIE)]).toBe(20);
});

test("Setujui lalu 'Kembali': tidak ada yang berubah", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  await user.click(
    within(held).getByRole("button", { name: `Setujui ${KOPI}` }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Kembali" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(within(section("Menunggu persetujuan")).getByText(KOPI)).toBeVisible();
});

test("Hitung ulang: penghitung satuan -> 'Dihitung ulang: 48 pcs · Hari ini 14.05'", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  await user.click(
    within(held).getByRole("button", { name: `Hitung ulang ${INDOMIE}` }),
  );
  const sheet = await screen.findByRole("dialog", { name: "Hitung ulang" });
  expect(sheet).toHaveTextContent(INDOMIE);
  const pcs = within(sheet).getByRole("textbox", { name: "Jumlah Pcs" });
  await user.clear(pcs);
  await user.type(pcs, "48");
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan hitungan" }),
  );

  expect(
    await screen.findByText(/Dihitung ulang: 48 pcs · Hari ini 14\.05/),
  ).toBeVisible();
  const li = rowOf(INDOMIE);
  expect(li).toHaveTextContent("Kurang 12 pcs");
  expect(within(li).queryByRole("button", { name: /Setujui/ })).toBeNull();
  expect(mockDb.get().stock[idOf(INDOMIE)]).toBe(48);
});

test("409 OPNAME_NOT_HELD: pesan tampil dan data dimuat ulang", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  // Pemilik lain menyetujui lebih dulu dari HP lain; halaman ini masih basi.
  const other = await post(
    `/api/owner/opname-sessions/A/items/${idOf(KOPI)}/approve`,
    {},
  );
  expect(other.status).toBe(200);
  await user.click(
    within(held).getByRole("button", { name: `Setujui ${KOPI}` }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Setujui",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Barang ini tidak lagi menunggu persetujuan",
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
  // Dimuat ulang: Kopi sudah pindah ke 'Selisih' dan berstatus disetujui.
  expect(await within(section("Selisih")).findByText(KOPI)).toBeVisible();
  expect(within(section("Menunggu persetujuan")).queryByText(KOPI)).toBeNull();
});

test("sesi tidak ada -> pesan galat dan tautan kembali", async () => {
  renderApp("/owner/lainnya/opname/nope");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Data tidak ditemukan",
  );
});

test("fokus pindah ke judul setelah Setujui (bukan body)", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  await user.click(
    within(held).getByRole("button", { name: `Setujui ${INDOMIE}` }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Setujui" }));
  await screen.findByText("Disetujui Pak Ahmad · Hari ini 14.05");
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Mi Instan" }),
    ),
  );
});

test("galat server saat hitung ulang: lembar tetap terbuka, hitungan tidak hilang, pesan tampil", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/owner/opname-sessions/:sid/items/:pid/recount", () =>
      HttpResponse.json(
        { code: "INTERNAL", title: "x", status: 500 },
        { status: 500 },
      ),
    ),
  );
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  await user.click(
    within(held).getByRole("button", { name: `Hitung ulang ${INDOMIE}` }),
  );
  const sheet = await screen.findByRole("dialog", { name: "Hitung ulang" });
  const pcs = within(sheet).getByRole("textbox", { name: "Jumlah Pcs" });
  await user.clear(pcs);
  await user.type(pcs, "48");
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan hitungan" }),
  );
  expect(await within(sheet).findByRole("alert")).toHaveTextContent(
    "Terjadi kesalahan di server",
  );
  expect(screen.getByRole("textbox", { name: "Jumlah Pcs" })).toHaveValue("48");
});

test("galat server saat Setujui: dialog tetap terbuka dengan pesan", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/owner/opname-sessions/:sid/items/:pid/approve", () =>
      HttpResponse.json(
        { code: "INTERNAL", title: "x", status: 500 },
        { status: 500 },
      ),
    ),
  );
  renderApp("/owner/lainnya/opname/A");
  const held = await screen.findByRole("region", {
    name: "Menunggu persetujuan",
  });
  await user.click(
    within(held).getByRole("button", { name: `Setujui ${KOPI}` }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Setujui" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Terjadi kesalahan di server",
  );
  expect(screen.getByRole("alertdialog")).toBeVisible();
});

test("barang 'diganti': hanya status, tanpa nilai Rp", async () => {
  vi.setSystemTime(T("11.00"));
  await submitCount("C", { kind: "kategori", category: "Mi Instan" }, [
    countOf(INDOMIE, 59, "11.00"),
  ]);
  renderApp("/owner/lainnya/opname/A");
  await screen.findByRole("heading", { level: 1, name: "Mi Instan" });
  const li = await vi.waitFor(() => {
    const row = rowOf(INDOMIE);
    expect(row).toHaveTextContent("Diganti hitungan baru");
    return row;
  });
  expect(li).not.toHaveTextContent("Rp");
  expect(li).not.toHaveTextContent("Kurang");
  expect(within(li).queryByRole("button")).toBeNull();
});
