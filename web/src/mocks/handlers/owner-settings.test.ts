import { beforeEach, describe, expect, test } from "vitest";
import type {
  Customer,
  KasirSettings,
  OwnerSettings,
  Problem,
  ThinMarginPreview,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  GetOwnerSettingsResponse,
  GetOwnerThinMarginPreviewResponse,
  PutOwnerQrisImageResponse,
  UpdateOwnerSettingsResponse,
} from "@/shared/api/gen/zod/owner/owner";
import { GetKasirSettingsResponse } from "@/shared/api/gen/zod/settings/settings";
import { DEFAULT_ATTENTION_RULES } from "@/shared/lib/attention-rules";
import { unitCost } from "@/shared/lib/product-rules";
import { mockDb } from "../db";
import { eceranOf } from "../products/views";
import { usableCost } from "../receipts/check";
import { thinMarginReport } from "../reports/thin-margin";
import {
  deepKeys,
  get,
  jpegBytes,
  json,
  login,
  ownerLogin,
  post,
} from "./test-helpers";

const patch = (body: unknown): Promise<Response> =>
  fetch("/api/owner/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const ownerSettings = async (): Promise<OwnerSettings> => {
  const res = await get("/api/owner/settings");
  expect(res.status).toBe(200);
  return GetOwnerSettingsResponse.parse(await json<OwnerSettings>(res));
};

const kasirSettings = async (): Promise<KasirSettings> => {
  const res = await get("/api/settings/kasir");
  expect(res.status).toBe(200);
  return GetKasirSettingsResponse.parse(await json<KasirSettings>(res));
};

const codeOf = async (res: Response) => (await json<Problem>(res)).code;

/** PATCH yang wajib ditolak 422 VALIDATION tanpa menyimpan apa pun. */
async function rejected(body: unknown): Promise<void> {
  const before = await ownerSettings();
  const res = await patch(body);
  expect(res.status, JSON.stringify(body)).toBe(422);
  expect(await codeOf(res)).toBe("VALIDATION");
  expect(await ownerSettings()).toEqual(before);
}

const STORE = {
  name: "ShaziaMart",
  address: "Jl. Kenanga No. 8, Sukamaju",
  receiptFooter: "Terima kasih, selamat belanja kembali",
};
const STOCK = {
  expirySoonDays: 30,
  opnameItemLimit: 100_000,
  opnameSessionLimit: 250_000,
};

const curahIds = (): string[] =>
  mockDb
    .get()
    .products.filter((p) => p.isCurah)
    .map((p) => p.id);

const kasirSection = (patch: Partial<OwnerSettings["kasir"]> = {}) => ({
  autoPrint: true,
  allowNegativeStock: true,
  curahFractions: [250, 500, 1000],
  quickCurahProductIds: curahIds(),
  ...patch,
});

describe("tanpa sesi pemilik", () => {
  test("semua endpoint Pengaturan → 401; sesi kasir tidak berlaku", async () => {
    expect((await login("123456")).status).toBe(200);
    expect((await get("/api/owner/settings")).status).toBe(401);
    expect((await patch({ ownerPhone: null })).status).toBe(401);
    expect(
      (await get("/api/owner/settings/thin-margin-preview?permille=100"))
        .status,
    ).toBe(401);
    const put = await fetch("/api/owner/settings/qris-image", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: jpegBytes(100).slice(),
    });
    expect(put.status).toBe(401);
    expect(mockDb.get().settings.ownerPhone).toBe("0812-3456-7890");
  });
});

describe("getOwnerSettings & updateOwnerSettings (K13, K19)", () => {
  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
  });

  test("GET: semua bagian dari state seed", async () => {
    expect(await ownerSettings()).toEqual({
      store: { ...STORE, qrisImageUrl: "/qris-contoh.svg" },
      kasir: {
        autoPrint: true,
        allowNegativeStock: true,
        curahFractions: [250, 500, 1000, 1500, 2000],
        quickCurahProductIds: curahIds(),
      },
      credit: { defaultCreditLimit: 500_000 },
      stock: STOCK,
      report: { thinMarginPermille: 100, unsoldDays: 30 },
      attention: DEFAULT_ATTENTION_RULES,
      ownerPhone: "0812-3456-7890",
    });
  });

  test("PATCH attention → 200 OwnerSettings lengkap; GET memuat nilai baru; bagian lain tidak berubah", async () => {
    const before = await ownerSettings();
    const attention = { ...DEFAULT_ATTENTION_RULES, cashDiffMin: 2_000 };
    const res = await patch({ attention });
    expect(res.status).toBe(200);
    const body = UpdateOwnerSettingsResponse.parse(
      await json<OwnerSettings>(res),
    );
    expect(body).toEqual({ ...before, attention });
    expect(await ownerSettings()).toEqual({ ...before, attention });
    expect(mockDb.get().attentionRules).toEqual(attention);
  });

  test("PATCH store.name → KasirSettings.storeName dan state.store.name ikut (K19); teks di-trim", async () => {
    const res = await patch({
      store: {
        name: "  Toko Baru ",
        address: " Jl. Melati 1 ",
        receiptFooter: "",
      },
    });
    expect(res.status).toBe(200);
    expect((await json<OwnerSettings>(res)).store).toEqual({
      name: "Toko Baru",
      address: "Jl. Melati 1",
      receiptFooter: "",
      qrisImageUrl: "/qris-contoh.svg",
    });
    expect((await kasirSettings()).storeName).toBe("Toko Baru");
    const s = mockDb.get();
    expect(s.store.name).toBe("Toko Baru");
    expect(s.storeProfile).toEqual({
      address: "Jl. Melati 1",
      receiptFooter: "",
    });
  });

  test("attention.shiftMaxHours 10 → KasirSettings.shiftMaxHours 10 (satu sumber)", async () => {
    const res = await patch({
      attention: { ...DEFAULT_ATTENTION_RULES, shiftMaxHours: 10 },
    });
    expect(res.status).toBe(200);
    expect((await kasirSettings()).shiftMaxHours).toBe(10);
    expect(Object.hasOwn(mockDb.get().settings, "shiftMaxHours")).toBe(false);
  });

  test("PATCH kasir, credit, stock, report → nilai baru tersimpan di aturan server", async () => {
    const ids = curahIds().slice(0, 2);
    const kasir = kasirSection({
      autoPrint: false,
      allowNegativeStock: false,
      curahFractions: [100, 250],
      quickCurahProductIds: ids,
    });
    expect((await patch({ kasir })).status).toBe(200);
    expect((await patch({ credit: { defaultCreditLimit: 0 } })).status).toBe(
      200,
    );
    const stock = {
      expirySoonDays: 90,
      opnameItemLimit: 5_000,
      opnameSessionLimit: 5_000,
    };
    expect((await patch({ stock })).status).toBe(200);
    const report = { thinMarginPermille: 0, unsoldDays: 365 };
    expect((await patch({ report })).status).toBe(200);

    const all = await ownerSettings();
    expect(all.kasir).toEqual(kasir);
    expect(all.credit).toEqual({ defaultCreditLimit: 0 });
    expect(all.stock).toEqual(stock);
    expect(all.report).toEqual(report);
    const s = mockDb.get();
    expect(s.stockRules).toEqual(stock);
    expect(s.reportRules).toEqual(report);
    expect(s.defaultCreditLimit).toBe(0);
    expect(await kasirSettings()).toMatchObject({
      autoPrint: false,
      allowNegativeStock: false,
      curahFractions: [100, 250],
      quickCurahProductIds: ids,
    });
  });

  test("beberapa bagian dalam satu PATCH diterapkan bersama", async () => {
    const res = await patch({
      credit: { defaultCreditLimit: 750_000 },
      ownerPhone: "+62 812-000-1111",
    });
    expect(res.status).toBe(200);
    expect(await json<OwnerSettings>(res)).toMatchObject({
      credit: { defaultCreditLimit: 750_000 },
      ownerPhone: "+62 812-000-1111",
    });
  });

  test("validasi K13 tiap batas → 422 VALIDATION tanpa menyimpan bagian mana pun", async () => {
    const att = DEFAULT_ATTENTION_RULES;
    const cases: unknown[] = [
      null,
      [],
      // store
      { store: { ...STORE, name: "   " } },
      { store: { ...STORE, name: "x".repeat(41) } },
      { store: { ...STORE, address: "x".repeat(121) } },
      { store: { ...STORE, receiptFooter: "x".repeat(121) } },
      { store: { name: "Toko" } },
      { store: null },
      // kasir
      { kasir: kasirSection({ curahFractions: [] }) },
      { kasir: kasirSection({ curahFractions: [500, 250] }) },
      { kasir: kasirSection({ curahFractions: [250, 250] }) },
      { kasir: kasirSection({ curahFractions: [0, 250] }) },
      { kasir: kasirSection({ curahFractions: [250, 100_001] }) },
      { kasir: kasirSection({ curahFractions: [1, 2, 3, 4, 5, 6, 7, 8, 9] }) },
      { kasir: kasirSection({ curahFractions: [250.5] }) },
      { kasir: kasirSection({ quickCurahProductIds: ["tidak-ada"] }) },
      {
        kasir: kasirSection({
          quickCurahProductIds: [
            mockDb.get().products.find((p) => !p.isCurah)?.id ?? "",
          ],
        }),
      },
      {
        kasir: kasirSection({
          quickCurahProductIds: Array.from({ length: 13 }, () =>
            curahIds(),
          ).flat(),
        }),
      },
      { kasir: { ...kasirSection(), autoPrint: "ya" } },
      // credit
      { credit: { defaultCreditLimit: -1 } },
      { credit: { defaultCreditLimit: 100_000_001 } },
      { credit: { defaultCreditLimit: 1.5 } },
      { credit: {} },
      // stock
      { stock: { ...STOCK, expirySoonDays: 0 } },
      { stock: { ...STOCK, expirySoonDays: 91 } },
      { stock: { ...STOCK, opnameItemLimit: -1 } },
      { stock: { ...STOCK, opnameSessionLimit: 10_000_001 } },
      { stock: { ...STOCK, opnameItemLimit: 300_000 } },
      // report
      { report: { thinMarginPermille: -1, unsoldDays: 30 } },
      { report: { thinMarginPermille: 1001, unsoldDays: 30 } },
      { report: { thinMarginPermille: 100, unsoldDays: 6 } },
      { report: { thinMarginPermille: 100, unsoldDays: 366 } },
      // attention
      { attention: { ...att, shiftMaxHours: 25 } },
      { attention: { ...att, shiftMaxHours: 0 } },
      { attention: { ...att, cashDiffMin: -1 } },
      { attention: { ...att, smallShortageWeekMax: 10_000_001 } },
      { attention: { ...att, expenseSingleMax: "50000" } },
      { attention: { ...att, expenseShiftMax: null } },
      { attention: { ...att, qrisDailyReconcile: 1 } },
      { attention: { cashDiffMin: 2_000 } },
      // ownerPhone
      { ownerPhone: "abc" },
      { ownerPhone: "0812345" },
      { ownerPhone: "0".repeat(17) },
      { ownerPhone: "+62 812-3456-7890" },
      { ownerPhone: 812345678 },
      // satu bagian salah menggagalkan seluruh PATCH
      {
        credit: { defaultCreditLimit: 1_000 },
        attention: { ...att, shiftMaxHours: 25 },
      },
    ];
    for (const body of cases) await rejected(body);
    expect(mockDb.get().defaultCreditLimit).toBe(500_000);
  });

  test("tepi batas yang sah → 200", async () => {
    const att = DEFAULT_ATTENTION_RULES;
    const ok: unknown[] = [
      {
        store: {
          name: "x".repeat(40),
          address: "y".repeat(120),
          receiptFooter: "",
        },
      },
      {
        kasir: kasirSection({ curahFractions: [1, 2, 3, 4, 5, 6, 7, 100_000] }),
      },
      { kasir: kasirSection({ quickCurahProductIds: [] }) },
      { credit: { defaultCreditLimit: 100_000_000 } },
      {
        stock: { expirySoonDays: 1, opnameItemLimit: 0, opnameSessionLimit: 0 },
      },
      { report: { thinMarginPermille: 1000, unsoldDays: 7 } },
      {
        attention: {
          ...att,
          cashDiffMin: 0,
          smallShortageWeekMax: 10_000_000,
          shiftMaxHours: 24,
          qrisDailyReconcile: false,
        },
      },
      { attention: { ...att, shiftMaxHours: 1 } },
      { ownerPhone: "08123456" },
      { ownerPhone: "+62 812-345-6789" },
      {},
    ];
    for (const body of ok) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(200);
    }
  });

  test("ownerPhone null → 200, dihapus; ownerPhone tidak dikirim → tidak berubah", async () => {
    expect((await patch({ credit: { defaultCreditLimit: 1 } })).status).toBe(
      200,
    );
    expect((await ownerSettings()).ownerPhone).toBe("0812-3456-7890");
    const res = await patch({ ownerPhone: null });
    expect(res.status).toBe(200);
    expect((await json<OwnerSettings>(res)).ownerPhone).toBeNull();
    expect((await login("123456")).status).toBe(200);
    expect((await kasirSettings()).ownerPhone).toBeNull();
  });
});

describe("getKasirSettings (K19)", () => {
  test("tanpa sesi kasir → ownerPhone null; dengan sesi kasir → nomor pemilik", async () => {
    expect((await kasirSettings()).ownerPhone).toBeNull();
    // Sesi pemilik bukan sesi kasir.
    expect((await ownerLogin()).status).toBe(200);
    expect((await kasirSettings()).ownerPhone).toBeNull();
    expect((await login("123456")).status).toBe(200);
    expect((await kasirSettings()).ownerPhone).toBe("0812-3456-7890");
  });

  test("respons kasir & orang toko tanpa key pemilik (deepKeys)", async () => {
    const OWNER_KEYS = [
      "address",
      "receiptFooter",
      "attention",
      "cashDiffMin",
      "smallShortageWeekMax",
      "expenseSingleMax",
      "expenseShiftMax",
      "qrisDailyReconcile",
      "defaultCreditLimit",
      "expirySoonDays",
      "opnameItemLimit",
      "opnameSessionLimit",
      "thinMarginPermille",
      "unsoldDays",
      "active",
      "onShift",
      "lockedUntil",
      "pin",
      "password",
    ];
    expect((await login("123456")).status).toBe(200);
    const settings = await json<KasirSettings>(
      await get("/api/settings/kasir"),
    );
    expect(Object.keys(settings).sort()).toEqual(
      [
        "storeName",
        "autoPrint",
        "curahFractions",
        "quickCurahProductIds",
        "qrisImageUrl",
        "allowNegativeStock",
        "ownerPhone",
        "shiftMaxHours",
      ].sort(),
    );
    const bodies: unknown[] = [settings];
    for (const path of ["/api/users/kasir", "/api/auth/session"]) {
      bodies.push(await (await get(path)).json());
    }
    expect(
      (
        await post("/api/staff/login", {
          userId: mockDb.get().users.find((u) => u.name === "Budi")?.id,
          pin: "654321",
        })
      ).status,
    ).toBe(200);
    for (const path of ["/api/staff/users", "/api/staff/session"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      bodies.push(await res.json());
    }
    for (const body of bodies) {
      const leaked = [...deepKeys(body)].filter((k) => OWNER_KEYS.includes(k));
      expect(leaked).toEqual([]);
    }
  });
});

describe("getOwnerThinMarginPreview", () => {
  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
  });

  /** Barang yang dinilai: aktif, ber-HPP, harga eceran > 0 (hitungan laporan). */
  const ratedCount = (): number =>
    mockDb.get().products.filter((p) => {
      if (p.status !== "aktif") return false;
      const eceran = eceranOf(p);
      return (
        eceran.price > 0 &&
        unitCost(usableCost(p.cost), eceran.unitSize) !== null
      );
    }).length;

  const preview = async (permille: number | string) =>
    get(`/api/owner/settings/thin-margin-preview?permille=${permille}`);

  test("permille=150 → {flagged, total} sama dengan laporan untung tipis pada batas itu, tanpa menyimpan", async () => {
    const res = await preview(150);
    expect(res.status).toBe(200);
    const body = GetOwnerThinMarginPreviewResponse.parse(
      await json<ThinMarginPreview>(res),
    );
    expect(mockDb.get().reportRules.thinMarginPermille).toBe(100);
    mockDb.update((s) => {
      s.reportRules.thinMarginPermille = 150;
    });
    const expected = thinMarginReport(mockDb.get()).count;
    expect(expected).toBeGreaterThan(0);
    expect(body).toEqual({ flagged: expected, total: ratedCount() });
    expect(body.flagged).toBeLessThanOrEqual(body.total);
  });

  test("batas 0 dan 1000 sah; batas lebih tinggi menandai lebih banyak", async () => {
    const low = await json<ThinMarginPreview>(await preview(0));
    const high = await json<ThinMarginPreview>(await preview(1000));
    expect(low.total).toBe(high.total);
    expect(high.flagged).toBeGreaterThan(low.flagged);
  });

  test("permille di luar 0..1000, bukan bilangan bulat, atau tidak ada → 422", async () => {
    for (const p of ["-1", "1001", "1.5", "abc", ""]) {
      const res = await preview(p);
      expect(res.status, p).toBe(422);
      expect(await codeOf(res)).toBe("VALIDATION");
    }
    const missing = await get("/api/owner/settings/thin-margin-preview");
    expect(missing.status).toBe(422);
  });
});

describe("putOwnerQrisImage & getQrisImage (K13, R3)", () => {
  /** Byte PNG palsu sepanjang `size` (diawali tanda tangan PNG 8 byte). */
  const pngBytes = (size: number): Uint8Array => {
    const bytes = new Uint8Array(size).map((_, i) => i % 249);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes;
  };

  const upload = (bytes: Uint8Array, type: string) =>
    fetch("/api/owner/settings/qris-image", {
      method: "PUT",
      headers: { "Content-Type": type },
      body: bytes.slice(),
    });

  const sameBytes = async (res: Response, bytes: Uint8Array) => {
    const got = new Uint8Array(await res.arrayBuffer());
    return got.length === bytes.length && got.every((b, i) => b === bytes[i]);
  };

  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
  });

  test("PNG 10 KB → 200; qrisImageUrl baru dapat di-GET publik dan dipakai kasir", async () => {
    const png = pngBytes(10 * 1024);
    const res = await upload(png, "image/png");
    expect(res.status).toBe(200);
    const body = PutOwnerQrisImageResponse.parse(
      await json<OwnerSettings>(res),
    );
    const url = body.store.qrisImageUrl;
    expect(url).toMatch(/^\/api\/settings\/qris-image\/[^/]+$/);
    expect((await ownerSettings()).store.qrisImageUrl).toBe(url);
    expect((await kasirSettings()).qrisImageUrl).toBe(url);

    // Publik: tanpa sesi apa pun.
    await post("/api/owner/logout", {});
    const image = await get(url);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(await sameBytes(image, png)).toBe(true);
  });

  test("JPEG tepat 1 MB → 200; unggah lagi mengganti gambar lama (URL lama 404)", async () => {
    const first = await json<OwnerSettings>(
      await upload(jpegBytes(1024 * 1024), "image/jpeg"),
    );
    const oldUrl = first.store.qrisImageUrl;
    expect((await get(oldUrl)).headers.get("Content-Type")).toBe("image/jpeg");

    const png = pngBytes(2048);
    const second = await json<OwnerSettings>(await upload(png, "image/png"));
    const newUrl = second.store.qrisImageUrl;
    expect(newUrl).not.toBe(oldUrl);
    expect((await get(oldUrl)).status).toBe(404);
    expect(await sameBytes(await get(newUrl), png)).toBe(true);
  });

  test("teks, 2 MB, kosong, atau isi tidak sesuai Content-Type → 422 tanpa mengubah gambar", async () => {
    const text = new TextEncoder().encode("bukan gambar");
    const cases: [Uint8Array, string][] = [
      [text, "text/plain"],
      [text, "image/png"],
      [pngBytes(2 * 1024 * 1024), "image/png"],
      [jpegBytes(1024 * 1024 + 1), "image/jpeg"],
      [new Uint8Array(0), "image/png"],
      [pngBytes(100), "image/jpeg"],
      [jpegBytes(100), "image/png"],
    ];
    for (const [bytes, type] of cases) {
      const res = await upload(bytes, type);
      expect(res.status, `${type} ${bytes.length}`).toBe(422);
      expect(await codeOf(res)).toBe("VALIDATION");
    }
    expect((await ownerSettings()).store.qrisImageUrl).toBe("/qris-contoh.svg");
  });

  test("id gambar tidak dikenal → 404", async () => {
    expect((await get("/api/settings/qris-image/tidak-ada")).status).toBe(404);
  });
});

describe("createCustomer memakai defaultCreditLimit saat ini (K13)", () => {
  test("limit pelanggan baru dari kasir = credit.defaultCreditLimit terbaru", async () => {
    expect((await ownerLogin()).status).toBe(200);
    expect(
      (await patch({ credit: { defaultCreditLimit: 750_000 } })).status,
    ).toBe(200);
    expect((await login("123456")).status).toBe(200);
    const res = await post("/api/customers", {
      name: "Bu Sari",
      phone: "081234567890",
    });
    expect(res.status).toBe(201);
    expect((await json<Customer>(res)).creditLimit).toBe(750_000);
  });
});
