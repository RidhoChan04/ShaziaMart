import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { json, post, receiptInput } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  OpnameScope,
  StaffOpnameSession,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";
import { loginRina } from "../receipt/form-test-kit";

const MI_INSTAN: OpnameScope = { kind: "kategori", category: "Mi Instan" };
const INDOMIE = "Indomie Goreng";
// Dua barang Mi Instan lain (seed katalog diacak): diisi di beforeEach.
let MIE_SEDAAP = "";
let INDOMIE_SOTO = "";
// 5 Nov 2026, jam WIB "HH.MM" ke epoch ms UTC.
const T = (hm: string): number => {
  const [h = 0, m = 0] = hm.split(".").map(Number);
  return Date.UTC(2026, 10, 5, h - 7, m);
};

const miInstan = () =>
  mockDb.get().products.filter((p) => p.category === "Mi Instan");
const idOf = (name: string) => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p.id;
};

/** Mi Instan stok 100 (Indomie Goreng 132) dan dihitung sama (cocok), kecuali `diffs` (nama -> hitungan). */
async function submitSession(
  diffs: Record<string, number>,
  id = "sesi-uji",
  clockShift = 0,
): Promise<StaffOpnameSession> {
  mockDb.update((s) => {
    for (const p of s.products.filter((x) => x.category === "Mi Instan")) {
      s.stock[p.id] = p.name === INDOMIE ? 132 : 100;
    }
  });
  const items = miInstan().map((p) => ({
    productId: p.id,
    qtyBase: diffs[p.name] ?? (p.name === INDOMIE ? 132 : 100),
    countedAt: T("10.00"),
  }));
  const res = await post("/api/staff/opname-sessions", {
    id,
    scope: MI_INSTAN,
    deviceNow: Date.now() + clockShift,
    items,
  });
  expect(res.status).toBe(201);
  return json<StaffOpnameSession>(res);
}

let threeDiffs: Record<string, number> = {};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T("10.30"));
  await loginRina(true);
  const others = miInstan()
    .map((p) => p.name)
    .filter((n) => n !== INDOMIE)
    .sort((a, b) => a.localeCompare(b, "id"));
  [MIE_SEDAAP = "", INDOMIE_SOTO = ""] = others;
  threeDiffs = { [INDOMIE]: 125, [MIE_SEDAAP]: 98, [INDOMIE_SOTO]: 97 };
});
afterEach(() => vi.useRealTimers());

const open = (id = "sesi-uji") => renderApp(`/staff/opname/${id}`);
const card = (name: string) =>
  screen.getByRole("region", { name }) as HTMLElement;
const save = () => screen.getByRole("button", { name: "Simpan hasil opname" });
const radio = (product: string, name: string) =>
  within(card(product)).getByRole("radio", { name });

test("ringkasan: cocok tanpa alasan, kartu selisih, tombol nonaktif dan hitungan belum beralasan", async () => {
  await submitSession(threeDiffs);
  open();

  expect(
    await screen.findByText(`${miInstan().length - 3} cocok`),
  ).toBeVisible();
  expect(screen.getByText("Langsung beres, tanpa alasan")).toBeVisible();
  expect(screen.getByText("3 selisih · wajib beri alasan")).toBeVisible();
  expect(screen.getByText("Mi Instan · dikirim 10.30")).toBeVisible();
  const c = card(INDOMIE);
  expect(within(c).getByText("Sistem 132 → hitungan 125")).toBeVisible();
  expect(within(c).getByText("Kurang 7 pcs")).toBeVisible();
  expect(within(card(INDOMIE_SOTO)).getByText(/^Kurang 3 /)).toBeVisible();
  expect(save()).toBeDisabled();
  expect(screen.getByText("3 barang belum diberi alasan")).toBeVisible();
  expect(document.body.textContent).not.toContain("Rp");
});

test("memilih chip radio mengurangi hitungan; semua terisi mengaktifkan tombol", async () => {
  const user = userEvent.setup();
  await submitSession(threeDiffs);
  open();
  await screen.findByText("3 barang belum diberi alasan");

  await user.click(radio(INDOMIE, "Rusak"));
  expect(screen.getByText("2 barang belum diberi alasan")).toBeVisible();
  await user.click(radio(MIE_SEDAAP, "Hilang"));
  expect(screen.getByText("1 barang belum diberi alasan")).toBeVisible();
  await user.click(radio(INDOMIE_SOTO, "Kedaluwarsa"));
  expect(screen.queryByText(/belum diberi alasan/)).toBeNull();
  await waitFor(() => expect(save()).toBeEnabled());
});

test("Salah input sebelumnya menampilkan Nota yang salah dengan opsi nota dan Tidak tahu notanya", async () => {
  const user = userEvent.setup();
  expect(
    (await post("/api/staff/receipts", receiptInput({ id: "nota-1" }))).status,
  ).toBe(201);
  await submitSession(threeDiffs);
  open();
  await screen.findByRole("region", { name: INDOMIE });
  expect(within(card(INDOMIE)).queryByText("Nota yang salah")).toBeNull();

  await user.click(radio(INDOMIE, "Salah input sebelumnya"));
  expect(within(card(INDOMIE)).getByText("Nota yang salah")).toBeVisible();
  expect(radio(INDOMIE, "CV Sumber Rejeki · nota 2 Nov 2026")).toBeVisible();
  expect(radio(INDOMIE, "Tidak tahu notanya")).toBeVisible();
  // Barang tanpa nota hanya punya Tidak tahu notanya.
  await user.click(radio(MIE_SEDAAP, "Salah input sebelumnya"));
  expect(radio(MIE_SEDAAP, "Tidak tahu notanya")).toBeVisible();
  expect(
    within(card(MIE_SEDAAP)).queryByRole("radio", { name: /· nota/ }),
  ).toBeNull();
});

test("simpan: receiptId hanya untuk salah input, toast, tanda per barang", async () => {
  const user = userEvent.setup();
  // Nota masuk sebelum jam hitung (10.00), jadi tidak menggeser stok sistem.
  vi.setSystemTime(T("09.00"));
  expect(
    (await post("/api/staff/receipts", receiptInput({ id: "nota-1" }))).status,
  ).toBe(201);
  vi.setSystemTime(T("10.30"));
  // Nota di atas mengubah HPP; pasang HPP tetap: Indomie murah (langsung disesuaikan),
  // Mie Sedaap kurang 100 pcs x Rp5.000 melewati batas (ditahan pemilik).
  mockDb.update((s) => {
    for (const p of s.products) {
      if (p.name === INDOMIE) p.cost = { amount: 2_600, qtyBase: 1 };
      if (p.name === MIE_SEDAAP) p.cost = { amount: 5_000, qtyBase: 1 };
    }
  });
  await submitSession({ ...threeDiffs, [MIE_SEDAAP]: 0 });
  const bodies: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (new URL(request.url).pathname.endsWith("/finish")) {
      bodies.push(await request.clone().json());
    }
  });
  open();
  await screen.findByText("3 barang belum diberi alasan");

  await user.click(radio(INDOMIE, "Salah input sebelumnya"));
  await user.click(radio(INDOMIE, "CV Sumber Rejeki · nota 2 Nov 2026"));
  await user.click(radio(MIE_SEDAAP, "Hilang"));
  await user.click(radio(INDOMIE_SOTO, "Salah input sebelumnya"));
  await user.click(radio(INDOMIE_SOTO, "Tidak tahu notanya"));
  await waitFor(() => expect(save()).toBeEnabled());
  await user.click(save());

  expect(await screen.findByText("Hasil opname tersimpan")).toBeVisible();
  expect(bodies).toHaveLength(1);
  const sent = bodies[0] as {
    reasons: { productId: string; reason: string; receiptId: string | null }[];
  };
  expect(sent.reasons).toHaveLength(3);
  expect(sent.reasons).toEqual(
    expect.arrayContaining([
      { productId: idOf(INDOMIE), reason: "salah_input", receiptId: "nota-1" },
      { productId: idOf(MIE_SEDAAP), reason: "hilang", receiptId: null },
      { productId: idOf(INDOMIE_SOTO), reason: "salah_input", receiptId: null },
    ]),
  );
  expect(within(card(INDOMIE)).getByText("Disesuaikan")).toBeVisible();
  expect(
    within(card(MIE_SEDAAP)).getByText("Menunggu persetujuan pemilik"),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Simpan hasil opname" }),
  ).toBeNull();
  expect(screen.getByText("Mi Instan · selesai 10.30")).toBeVisible();
  // I1: tombol Simpan hilang; fokus pindah ke Kembali, bukan body.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Kembali" })).toHaveFocus(),
  );
});

test("jam diperkirakan tampil bila jam HP melenceng", async () => {
  await submitSession(threeDiffs, "sesi-uji", 20 * 60_000);
  open();
  await screen.findByRole("region", { name: INDOMIE });
  expect(within(card(INDOMIE)).getByText("jam diperkirakan")).toBeVisible();
});

test("422 Pilih alasan menandai kartunya Wajib pilih alasan", async () => {
  const user = userEvent.setup();
  await submitSession(threeDiffs);
  server.use(
    http.post("/api/staff/opname-sessions/:id/finish", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Validasi gagal",
          status: 422,
          code: "VALIDATION",
          errors: [{ productId: idOf(MIE_SEDAAP), message: "Pilih alasan" }],
        },
        {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  open();
  await screen.findByText("3 barang belum diberi alasan");
  for (const n of [INDOMIE, MIE_SEDAAP, INDOMIE_SOTO]) {
    await user.click(radio(n, "Rusak"));
  }
  await user.click(save());

  expect(
    await within(card(MIE_SEDAAP)).findByText("Wajib pilih alasan"),
  ).toBeVisible();
  expect(within(card(INDOMIE)).queryByText("Wajib pilih alasan")).toBeNull();
});

test("offline: tombol nonaktif dan catatan perlu tersambung", async () => {
  const user = userEvent.setup();
  await submitSession(threeDiffs);
  server.use(http.get("/api/health", () => HttpResponse.error()));
  open();
  await screen.findByText("3 barang belum diberi alasan");
  for (const n of [INDOMIE, MIE_SEDAAP, INDOMIE_SOTO]) {
    await user.click(radio(n, "Rusak"));
  }
  expect(
    await screen.findByText("Perlu tersambung ke toko untuk menyimpan"),
  ).toBeVisible();
  expect(save()).toBeDisabled();
});

test("sesi selesai tampil hanya-baca dengan tanda per barang", async () => {
  await submitSession(threeDiffs);
  const res = await post("/api/staff/opname-sessions/sesi-uji/finish", {
    reasons: [INDOMIE, MIE_SEDAAP, INDOMIE_SOTO].map((n) => ({
      productId: idOf(n),
      reason: "rusak",
      receiptId: null,
    })),
  });
  expect(res.status).toBe(200);
  open();

  expect(await screen.findByText("Mi Instan · selesai 10.30")).toBeVisible();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Simpan hasil opname" }),
  ).toBeNull();
  expect(within(card(INDOMIE)).getByText("Disesuaikan")).toBeVisible();
  expect(within(card(INDOMIE)).getByText("Rusak")).toBeVisible();
  expect(document.body.textContent).not.toContain("Rp");
});

test("Salah input sebelumnya belum lengkap sebelum nota atau Tidak tahu notanya dipilih", async () => {
  const user = userEvent.setup();
  await submitSession(threeDiffs);
  open();
  await screen.findByText("3 barang belum diberi alasan");
  await user.click(radio(MIE_SEDAAP, "Hilang"));
  await user.click(radio(INDOMIE_SOTO, "Rusak"));
  await user.click(radio(INDOMIE, "Salah input sebelumnya"));

  expect(screen.getByText("1 barang belum diberi alasan")).toBeVisible();
  expect(radio(INDOMIE, "Tidak tahu notanya")).not.toBeChecked();
  expect(save()).toBeDisabled();
  await user.click(radio(INDOMIE, "Tidak tahu notanya"));
  expect(screen.queryByText(/belum diberi alasan/)).toBeNull();
  await waitFor(() => expect(save()).toBeEnabled());
});

test("422 untuk barang tanpa kartu tampil sebagai pesan umum dan sesi dimuat ulang", async () => {
  const user = userEvent.setup();
  await submitSession(threeDiffs);
  let reads = 0;
  server.use(
    http.get("/api/staff/opname-sessions/:id", () => {
      reads += 1;
      return undefined;
    }),
    http.post("/api/staff/opname-sessions/:id/finish", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Validasi gagal",
          status: 422,
          code: "VALIDATION",
          errors: [
            {
              productId: "tidak-tampil",
              message: "Barang ini tidak perlu alasan",
            },
          ],
        },
        {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  open();
  await screen.findByText("3 barang belum diberi alasan");
  for (const n of [INDOMIE, MIE_SEDAAP, INDOMIE_SOTO]) {
    await user.click(radio(n, "Rusak"));
  }
  const before = reads;
  await user.click(save());

  expect(
    await screen.findByText("Barang ini tidak perlu alasan"),
  ).toBeVisible();
  await waitFor(() => expect(reads).toBeGreaterThan(before));
});

test("barang diganti tidak dihitung dan tidak diminta alasan", async () => {
  await submitSession(threeDiffs);
  const newer = await post("/api/staff/opname-sessions", {
    id: "sesi-baru",
    scope: MI_INSTAN,
    deviceNow: Date.now(),
    items: [{ productId: idOf(INDOMIE), qtyBase: 120, countedAt: T("10.20") }],
  });
  expect(newer.status).toBe(201);
  open();

  expect(
    await screen.findByText("2 selisih · wajib beri alasan"),
  ).toBeVisible();
  expect(screen.getByText("2 barang belum diberi alasan")).toBeVisible();
  const c = card(INDOMIE);
  expect(within(c).getByText("Diganti hitungan baru")).toBeVisible();
  expect(within(c).queryByRole("radio")).toBeNull();
});
