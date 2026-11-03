import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import type {
  PriceSource,
  ProductCost,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const INDOMIE = "Indomie Goreng";
// 17 Okt 2026, 08.20 UTC = 15.20 WIB
const CHANGED_AT = Date.UTC(2026, 9, 17, 8, 20);

beforeEach(async () => {
  await ownerLogin();
});

function indomie() {
  const p = mockDb.get().products.find((x) => x.name === INDOMIE);
  if (!p) throw new Error("seed tanpa Indomie");
  return p;
}

/** Modal Indomie naik {104000,40} -> {108000,40} (eceran 2600 -> 2700). */
function seedCostAlert(
  to: ProductCost = { amount: 108000, qtyBase: 40 },
  source: PriceSource = "pemilik",
) {
  const id = indomie().id;
  mockDb.update((s) => {
    const p = s.products.find((x) => x.id === id);
    if (!p) throw new Error("seed");
    p.cost = to;
    s.costAlerts[id] = {
      fromCost: { amount: 104000, qtyBase: 40 },
      changedAt: CHANGED_AT,
      source,
    };
  });
}

const prices = () =>
  indomie().units.map((u) => ({
    eceran: u.price,
    tiers: u.wholesaleTiers.map((t) => t.price),
  }));

async function openFromBeranda(
  title = "Harga modal Indomie Goreng naik Rp100",
) {
  const utils = renderApp("/owner");
  await userEvent.click(
    await screen.findByRole("link", { name: new RegExp(`^${title}`) }),
  );
  const sheet = await screen.findByRole("dialog", { name: /^Harga modal/ });
  return { ...utils, sheet };
}

const block = (sheet: HTMLElement, name: string) =>
  within(sheet).getByRole("region", { name });

test("ketuk butir di Beranda -> lembar: judul, perbandingan modal, untung, dan harga saran", async () => {
  seedCostAlert();
  const { sheet, router } = await openFromBeranda();

  expect(router.state.location.pathname).toBe(`/owner/barang/${indomie().id}`);
  expect(router.state.location.search).toEqual({ lembar: "harga" });
  expect(
    within(sheet).getByRole("heading", { name: "Harga modal naik" }),
  ).toBeInTheDocument();
  expect(within(sheet).getByText(INDOMIE)).toBeInTheDocument();
  expect(
    within(sheet).getByRole("button", { name: "Tutup" }),
  ).toBeInTheDocument();

  const eceran = block(sheet, "Eceran · per pcs");
  expect(within(eceran).getByText("Rp2.600 → Rp2.700")).toBeInTheDocument();
  expect(
    within(eceran).getByText("+Rp100 · oleh Pemilik, 15.20"),
  ).toBeInTheDocument();
  expect(within(eceran).getByText("Rp3.100")).toBeInTheDocument();
  expect(within(eceran).getByText("19% → 15%")).toBeInTheDocument();
  expect(within(eceran).getByText("Turun: Rp500 → Rp400")).toBeInTheDocument();
  expect(
    within(eceran).getByText("Harga saran Rp3.500 · untung tetap 19%"),
  ).toBeInTheDocument();
  expect(within(eceran).getByPlaceholderText("3.500")).toHaveValue("");
  expect(
    within(eceran).getByText("untung dihitung otomatis"),
  ).toBeInTheDocument();

  const grosir = block(sheet, "Grosir · beli 40+ pcs");
  expect(within(grosir).getByText("Rp2.800")).toBeInTheDocument();
  expect(within(grosir).getByText("8% → 4%")).toBeInTheDocument();
  expect(within(grosir).getByText("Turun: Rp200 → Rp100")).toBeInTheDocument();
  expect(
    within(grosir).getByText("Harga saran Rp3.000 · untung tetap 8%"),
  ).toBeInTheDocument();

  const dus = block(sheet, "Dus · isi 40 pcs");
  expect(within(dus).getByText("Rp104.000 → Rp108.000")).toBeInTheDocument();
  expect(
    within(dus).getByText("+Rp4.000 · oleh Pemilik, 15.20"),
  ).toBeInTheDocument();
  expect(within(dus).getByText("Turun: Rp8.000 → Rp4.000")).toBeInTheDocument();
  expect(
    within(dus).getByText("Harga saran Rp116.500 · untung tetap 8%"),
  ).toBeInTheDocument();

  expect(
    within(sheet).getByRole("button", { name: "Pakai harga ini" }),
  ).toBeInTheDocument();
  expect(
    within(sheet).getByRole("button", { name: "Harga tetap" }),
  ).toBeInTheDocument();
  expect(
    within(sheet).getByRole("button", { name: "Nanti saja" }),
  ).toBeInTheDocument();
  // Tidak ada yang berubah sebelum pemilik menekan tombol.
  expect(prices()).toEqual([
    { eceran: 3100, tiers: [2800] },
    { eceran: 112000, tiers: [] },
  ]);
});

test("Pakai harga ini -> eceran 3500, grosir 3000, dus 116500; butir hilang dari Beranda; 3 entri riwayat harga", async () => {
  seedCostAlert();
  const before = mockDb
    .get()
    .priceHistory.filter((e) => e.productId === indomie().id).length;
  const { sheet, router } = await openFromBeranda();

  await userEvent.click(
    within(sheet).getByRole("button", { name: "Pakai harga ini" }),
  );

  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Harga modal/ }),
    ).not.toBeInTheDocument(),
  );
  expect(router.state.location.search).toEqual({});
  expect(prices()).toEqual([
    { eceran: 3500, tiers: [3000] },
    { eceran: 116500, tiers: [] },
  ]);
  const history = mockDb
    .get()
    .priceHistory.filter((e) => e.productId === indomie().id);
  expect(history.length - before).toBe(3);
  expect(mockDb.get().costAlerts[indomie().id]).toBeUndefined();
  // Detail memuat harga baru
  const harga = await screen.findByRole("region", { name: "Harga" });
  expect(await within(harga).findByText("Rp3.500")).toBeInTheDocument();

  await router.navigate({ to: "/owner" });
  await screen.findByRole("heading", { name: "Perlu perhatian" });
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /^Harga modal Indomie/ }),
    ).not.toBeInTheDocument(),
  );
});

test("ketik 3.400 di eceran -> tombol 'Simpan harga', 'untung Rp700 (26% dari modal)'; simpan -> eceran 3400, lainnya saran", async () => {
  seedCostAlert();
  const { sheet } = await openFromBeranda();
  const eceran = block(sheet, "Eceran · per pcs");

  expect(
    within(sheet).getByRole("button", { name: "Pakai harga ini" }),
  ).toBeInTheDocument();
  await userEvent.type(
    within(eceran).getByRole("textbox", { name: "atau ketik harga sendiri" }),
    "3.400",
  );
  expect(
    within(eceran).getByText("untung Rp700 (26% dari modal)"),
  ).toBeInTheDocument();
  expect(
    within(sheet).queryByRole("button", { name: "Pakai harga ini" }),
  ).not.toBeInTheDocument();

  await userEvent.click(
    within(sheet).getByRole("button", { name: "Simpan harga" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Harga modal/ }),
    ).not.toBeInTheDocument(),
  );
  expect(prices()).toEqual([
    { eceran: 3400, tiers: [3000] },
    { eceran: 116500, tiers: [] },
  ]);
});

test("ketik 2.500 -> error di blok eceran 'Harga jual di bawah modal (Rp2.700)'; lembar tetap terbuka, harga tidak berubah", async () => {
  seedCostAlert();
  const { sheet } = await openFromBeranda();
  const eceran = block(sheet, "Eceran · per pcs");

  await userEvent.type(
    within(eceran).getByRole("textbox", { name: "atau ketik harga sendiri" }),
    "2.500",
  );
  expect(
    within(eceran).getByText("rugi Rp200 (7% dari modal)"),
  ).toBeInTheDocument();
  await userEvent.click(
    within(sheet).getByRole("button", { name: "Simpan harga" }),
  );

  expect(
    await within(eceran).findByText("Harga jual di bawah modal (Rp2.700)"),
  ).toBeInTheDocument();
  expect(
    within(block(sheet, "Dus · isi 40 pcs")).queryByRole("alert"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: /^Harga modal/ })).toBe(sheet);
  expect(prices()).toEqual([
    { eceran: 3100, tiers: [2800] },
    { eceran: 112000, tiers: [] },
  ]);
  expect(mockDb.get().costAlerts[indomie().id]).toBeDefined();
});

test("ketikan bukan angka -> pesan di blok dan tombol simpan nonaktif", async () => {
  seedCostAlert();
  const { sheet } = await openFromBeranda();
  const eceran = block(sheet, "Eceran · per pcs");
  await userEvent.type(
    within(eceran).getByRole("textbox", { name: "atau ketik harga sendiri" }),
    "tiga ribu",
  );
  expect(
    within(eceran).getByText("Ketik angka saja, mis. 3500"),
  ).toBeInTheDocument();
  expect(
    within(sheet).getByRole("button", { name: "Simpan harga" }),
  ).toBeDisabled();
});

test("Harga tetap -> butir hilang, harga tidak berubah", async () => {
  seedCostAlert();
  const { sheet, router } = await openFromBeranda();

  await userEvent.click(
    within(sheet).getByRole("button", { name: "Harga tetap" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Harga modal/ }),
    ).not.toBeInTheDocument(),
  );
  expect(router.state.location.search).toEqual({});
  expect(mockDb.get().costAlerts[indomie().id]).toBeUndefined();
  expect(prices()).toEqual([
    { eceran: 3100, tiers: [2800] },
    { eceran: 112000, tiers: [] },
  ]);
  await router.navigate({ to: "/owner" });
  await screen.findByRole("heading", { name: "Perlu perhatian" });
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /^Harga modal Indomie/ }),
    ).not.toBeInTheDocument(),
  );
});

test("Nanti saja dan Tutup -> hanya menutup; butir tetap", async () => {
  seedCostAlert();
  const first = await openFromBeranda();
  await userEvent.click(
    within(first.sheet).getByRole("button", { name: "Nanti saja" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Harga modal/ }),
    ).not.toBeInTheDocument(),
  );
  expect(first.router.state.location.search).toEqual({});
  expect(mockDb.get().costAlerts[indomie().id]).toBeDefined();
  expect(prices()[0]).toEqual({ eceran: 3100, tiers: [2800] });

  await first.router.navigate({ to: "/owner" });
  const again = await screen.findByRole("link", {
    name: /^Harga modal Indomie Goreng naik Rp100/,
  });
  await userEvent.click(again);
  const sheet = await screen.findByRole("dialog", { name: /^Harga modal/ });
  await userEvent.click(within(sheet).getByRole("button", { name: "Tutup" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Harga modal/ }),
    ).not.toBeInTheDocument(),
  );
  expect(mockDb.get().costAlerts[indomie().id]).toBeDefined();
});

test("sumber impor -> 'lewat Impor Excel'", async () => {
  seedCostAlert({ amount: 108000, qtyBase: 40 }, "impor");
  const { sheet } = await openFromBeranda();
  expect(
    within(block(sheet, "Eceran · per pcs")).getByText(
      "+Rp100 · lewat Impor Excel, 15.20",
    ),
  ).toBeInTheDocument();
});

test("modal turun -> judul 'Harga modal turun', saran tetap ke atas Rp500", async () => {
  seedCostAlert({ amount: 100000, qtyBase: 40 });
  const { sheet } = await openFromBeranda("Harga modal Indomie Goreng turun");
  expect(
    within(sheet).getByRole("heading", { name: "Harga modal turun" }),
  ).toBeInTheDocument();
  const eceran = block(sheet, "Eceran · per pcs");
  expect(within(eceran).getByText("Rp2.600 → Rp2.500")).toBeInTheDocument();
  expect(
    within(eceran).getByText("-Rp100 · oleh Pemilik, 15.20"),
  ).toBeInTheDocument();
  expect(within(eceran).getByText("Naik: Rp500 → Rp600")).toBeInTheDocument();
  // 3100 x 2500 / 2600 = 2980,8 -> Rp3.000
  expect(
    within(eceran).getByText("Harga saran Rp3.000 · untung tetap 19%"),
  ).toBeInTheDocument();
});

test("eceran terbulatkan sama: judul tanpa 'Rp0', blok eceran tanpa saran, dus tetap bisa disesuaikan", async () => {
  seedCostAlert({ amount: 104010, qtyBase: 40 });
  const { sheet } = await openFromBeranda("Harga modal Indomie Goreng berubah");
  const eceran = block(sheet, "Eceran · per pcs");
  expect(within(eceran).getByText("Rp2.600 → Rp2.600")).toBeInTheDocument();
  expect(within(eceran).getByText(/^Tidak berubah/)).toBeInTheDocument();
  expect(within(eceran).queryByText(/Harga saran/)).not.toBeInTheDocument();
  expect(
    within(block(sheet, "Dus · isi 40 pcs")).getByText(
      "Harga saran Rp112.500 · untung tetap 8%",
    ),
  ).toBeInTheDocument();

  await userEvent.click(
    within(sheet).getByRole("button", { name: "Pakai harga ini" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: /^Harga modal/ }),
    ).not.toBeInTheDocument(),
  );
  // Hanya baris bersaran yang dikirim: eceran dan grosir tidak disentuh.
  expect(prices()).toEqual([
    { eceran: 3100, tiers: [2800] },
    { eceran: 112500, tiers: [] },
  ]);
});

test("?lembar=harga tanpa peringatan modal -> lembar tidak terbuka", async () => {
  renderApp(`/owner/barang/${indomie().id}?lembar=harga`);
  await screen.findByRole("heading", { level: 1, name: INDOMIE });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
