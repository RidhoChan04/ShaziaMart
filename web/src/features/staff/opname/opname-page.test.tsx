import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { get, json, post } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import type {
  StaffOpnameCategories,
  StaffOpnameSession,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { opnameDraft, opnameStoreWith } from "./opname-fixtures";
import {
  DAY,
  loginStaff,
  MI_INSTAN,
  miInstan,
  renderOpname,
  staffId,
  submitMiInstan,
  T,
} from "./opname-test-kit";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T("10.30"));
  await loginStaff();
});
afterEach(() => vi.useRealTimers());

const CATEGORIES = "Kategori · paling lama dihitung di atas";
const group = (name: string) => within(screen.getByRole("region", { name }));
const categoryRow = (name: string) => {
  const row = group(CATEGORIES)
    .getAllByRole("button")
    .find((r) => r.textContent?.includes(name));
  if (!row) throw new Error(`tanpa baris ${name}`);
  return row;
};
const otherCategory = (): string => {
  const p = mockDb.get().products.find((x) => x.category !== "Mi Instan");
  if (!p?.category) throw new Error("seed tanpa kategori lain");
  return p.category;
};

test("kategori urut dari server; yang pertama 'Disarankan'; 'belum pernah dihitung'; Semua barang (stok awal)", async () => {
  // Mi Instan dihitung 41 hari lalu → turun ke bawah kategori yang belum pernah dihitung.
  vi.setSystemTime(T("10.30") - 41 * DAY);
  await submitMiInstan("lama");
  vi.setSystemTime(T("10.30"));
  const api = await json<StaffOpnameCategories>(
    await get("/api/staff/opname/categories"),
  );
  renderOpname("/staff/opname");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Stok opname" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Satu rak, 15–30 menit. Toko tetap buka."),
  ).toBeInTheDocument();
  await screen.findByRole("region", { name: CATEGORIES });
  const rows = group(CATEGORIES).getAllByRole("button");
  expect(rows).toHaveLength(api.categories.length);
  api.categories.forEach((c, i) => {
    expect(rows[i]).toHaveTextContent(c.scope.category ?? "Tanpa kategori");
    expect(rows[i]).toHaveTextContent(`${c.productCount} barang`);
  });
  const first = within(rows[0] as HTMLElement);
  expect(first.getByText("Disarankan")).toBeVisible();
  expect(first.getByText("belum pernah dihitung")).toBeVisible();
  expect(group(CATEGORIES).getAllByText("Disarankan")).toHaveLength(1);
  expect(categoryRow("Mi Instan")).toHaveTextContent(
    "terakhir dihitung 41 hari lalu",
  );

  const all = group("Hitung semua");
  expect(all.getByText("Semua barang (stok awal)")).toBeVisible();
  expect(
    all.getByText(`${api.allCount} barang · untuk hitungan pertama`),
  ).toBeVisible();
});

test("terakhir dihitung hari ini", async () => {
  await submitMiInstan("hari-ini");
  renderOpname("/staff/opname");
  await screen.findByRole("region", { name: CATEGORIES });
  expect(categoryRow("Mi Instan")).toHaveTextContent(
    "terakhir dihitung hari ini",
  );
});

test("lingkup Tanpa kategori tampil bila ada barang ber-kategori null", async () => {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === "Gula Pasir");
    if (p) p.category = null;
  });
  renderOpname("/staff/opname");
  await screen.findByRole("region", { name: CATEGORIES });
  expect(group(CATEGORIES).getByText("Tanpa kategori")).toBeVisible();
});

test("grup Sedang dihitung / Perlu diberi alasan / Riwayat", async () => {
  const [a] = miInstan();
  const other = otherCategory();
  // Perlu diberi alasan: satu selisih kecil, dikirim 10.30.
  await submitMiInstan("sesi-alasan", (n) => (n === a?.name ? 97 : 100));
  // Riwayat: lingkup lain tanpa selisih → langsung selesai.
  await submitMiInstan("sesi-riwayat", () => 100, {
    kind: "kategori",
    category: other,
  });
  const userId = staffId();
  const store = await opnameStoreWith(
    opnameDraft("d-hitung", { userId, status: "counting", createdAt: 1 }),
    opnameDraft("d-semua", {
      userId,
      status: "counting",
      createdAt: 2,
      scope: { kind: "semua", category: null },
    }),
    opnameDraft("d-tolak", {
      userId,
      status: "rejected",
      createdAt: 3,
      scope: { kind: "kategori", category: other },
    }),
  );
  renderOpname("/staff/opname", store);

  await screen.findByRole("region", { name: "Sedang dihitung" });
  const rows = group("Sedang dihitung").getAllByRole("button");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Mi Instan");
  expect(rows[0]).toHaveTextContent("2 dari 3 dihitung");
  expect(rows[1]).toHaveTextContent("Semua barang");
  expect(rows[2]).toHaveTextContent("Perlu dibetulkan");

  await screen.findByRole("region", { name: "Perlu diberi alasan" });
  const reasons = group("Perlu diberi alasan");
  expect(reasons.getByText("Mi Instan")).toBeVisible();
  expect(reasons.getByText("1 selisih · dikirim 10.30")).toBeVisible();

  const history = group("Riwayat");
  expect(history.getByText(other)).toBeVisible();
  expect(history.getByText("5 Nov · 0 selisih")).toBeVisible();
});

test("riwayat: barang ditahan → '{h} menunggu persetujuan'", async () => {
  const [a] = miInstan();
  const sent = await submitMiInstan("sesi-tahan", (n) =>
    n === a?.name ? 100_000 : 100,
  );
  const res = await post(`/api/staff/opname-sessions/${sent.id}/finish`, {
    reasons: sent.items
      .filter((i) => i.state === "menunggu_alasan")
      .map((i) => ({
        productId: i.productId,
        reason: "rusak",
        receiptId: null,
      })),
  });
  const finished = await json<StaffOpnameSession>(res);
  expect(finished.status).toBe("selesai");
  expect(finished.items.some((i) => i.state === "ditahan")).toBe(true);
  renderOpname("/staff/opname");
  await screen.findByRole("region", { name: "Riwayat" });
  expect(group("Riwayat").getByText("1 menunggu persetujuan")).toBeVisible();
});

test("mulai offline → pesan, tanpa membuat draf", async () => {
  const user = userEvent.setup();
  const { opname, queryClient, router } = renderOpname("/staff/opname");
  await screen.findByRole("region", { name: CATEGORIES });
  setScenario("server-mati");
  await queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() });
  await user.click(categoryRow("Mi Instan"));
  expect(
    await screen.findByText("Perlu tersambung ke toko untuk mulai menghitung"),
  ).toBeVisible();
  expect(await opname.list()).toHaveLength(0);
  expect(router.state.location.pathname).toBe("/staff/opname");
});

test("mulai kategori → draf counting berisi salinan daftar barang, lalu layar hitung", async () => {
  const user = userEvent.setup();
  const { opname, router } = renderOpname("/staff/opname");
  await screen.findByRole("region", { name: CATEGORIES });
  await user.click(categoryRow("Mi Instan"));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/hitung"),
  );
  const [draft] = await opname.list();
  expect(draft).toMatchObject({
    status: "counting",
    userId: staffId(),
    scope: MI_INSTAN,
    counts: {},
  });
  expect(draft?.products).toHaveLength(miInstan().length);
  expect(router.state.location.search).toEqual({ draf: draft?.id });
});

test("M6: dua ketukan dalam satu frame → satu draf saja", async () => {
  const { opname, router } = renderOpname("/staff/opname");
  await screen.findByRole("region", { name: CATEGORIES });
  const row = categoryRow("Mi Instan");
  fireEvent.click(row);
  fireEvent.click(row);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/hitung"),
  );
  expect(await opname.list()).toHaveLength(1);
});

test("mulai lingkup yang punya draf counting → membuka draf itu, tidak membuat baru", async () => {
  const user = userEvent.setup();
  const store = await opnameStoreWith(
    opnameDraft("d-lama", { userId: staffId(), status: "counting" }),
  );
  const { opname, router } = renderOpname("/staff/opname", store);
  await screen.findByRole("region", { name: CATEGORIES });
  await user.click(categoryRow("Mi Instan"));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/hitung"),
  );
  expect(router.state.location.search).toEqual({ draf: "d-lama" });
  expect((await opname.list()).map((d) => d.id)).toEqual(["d-lama"]);
});

test("baris sesi 'Perlu diberi alasan' → halaman hasil", async () => {
  const user = userEvent.setup();
  const [a] = miInstan();
  await submitMiInstan("sesi-buka", (n) => (n === a?.name ? 97 : 100));
  const { router } = renderOpname("/staff/opname");
  await screen.findByRole("region", { name: "Perlu diberi alasan" });
  await user.click(
    group("Perlu diberi alasan").getAllByRole("button")[0] as HTMLElement,
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/opname/sesi-buka"),
  );
});
