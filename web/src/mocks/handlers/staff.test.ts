import { HttpResponse, type HttpResponseResolver } from "msw";
import { describe, expect, test, vi } from "vitest";
import type {
  Session,
  StaffProduct,
  StaffShift,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockProduct, mockDb } from "../db";
import { setScenario } from "../scenarios";
import { staffRealm, TUNNEL_HEADERS } from "./staff-realm";
import {
  deepKeys,
  FORBIDDEN_STAFF_KEYS,
  get,
  json,
  login,
  ownerLogin,
  post,
  put,
  staffLogin,
  unitOf,
  userId,
} from "./test-helpers";

const INDOMIE = "Indomie Goreng";
const BIMOLI = "Minyak Goreng Bimoli 2 L";

const code = async (res: Response) =>
  ((await res.json()) as { code: string }).code;

const search = async (q: string) =>
  json<StaffProduct[]>(
    await get(`/api/staff/products?q=${encodeURIComponent(q)}`),
  );

const names = (products: StaffProduct[]) => products.map((p) => p.name);

function updateProduct(name: string, fn: (p: MockProduct) => void): void {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === name);
    if (!p) throw new Error(`seed tanpa ${name}`);
    fn(p);
  });
}

describe("login & sesi orang toko", () => {
  test("login staf Rina 123456 → 200 {user:{name:'Rina', role:'kasir'}}; state.session (kasir) & ownerSession tetap null", async () => {
    const res = await staffLogin();
    expect(res.status).toBe(200);
    expect(await json<Session>(res)).toEqual({
      user: { id: userId("Rina"), name: "Rina", role: "kasir" },
    });
    const s = mockDb.get();
    expect(s.staffSession).toEqual({ userId: userId("Rina") });
    expect(s.session).toBeNull();
    expect(s.ownerSession).toBeNull();
    const session = await get("/api/staff/session");
    expect(session.status).toBe(200);
    expect((await json<Session>(session)).user.name).toBe("Rina");
    // Sesi staf tidak berlaku di realm kasir.
    expect((await get("/api/auth/session")).status).toBe(401);
  });

  test("logout staf tidak menghapus sesi kasir maupun pemilik; login kasir tidak membuat sesi staf", async () => {
    expect((await login("654321", "Budi")).status).toBe(200);
    expect((await ownerLogin()).status).toBe(200);
    expect(mockDb.get().staffSession).toBeNull();
    expect((await get("/api/staff/session")).status).toBe(401);

    expect((await staffLogin()).status).toBe(200);
    expect((await post("/api/staff/logout", {})).status).toBe(204);
    const s = mockDb.get();
    expect(s.staffSession).toBeNull();
    expect(s.session).toEqual({ userId: userId("Budi") });
    expect(s.ownerSession).toEqual({ userId: userId("Pak Ahmad") });
    expect((await get("/api/staff/session")).status).toBe(401);
    // Idempoten: keluar tanpa sesi tetap 204.
    expect((await post("/api/staff/logout", {})).status).toBe(204);
  });

  test("logout kasir & pemilik tidak menghapus sesi staf", async () => {
    await login("654321", "Budi");
    await ownerLogin();
    await staffLogin();
    expect((await post("/api/auth/logout", {})).status).toBe(204);
    expect((await post("/api/owner/logout", {})).status).toBe(204);
    expect(mockDb.get().staffSession).toEqual({ userId: userId("Rina") });
    expect((await get("/api/staff/session")).status).toBe(200);
  });

  test("users staf: Rina & Budi saja; Pak Ahmad PIN 999999 → 401 PIN_INVALID", async () => {
    const users = await json<User[]>(await get("/api/staff/users"));
    expect(users).toEqual([
      { id: userId("Rina"), name: "Rina", role: "kasir" },
      { id: userId("Budi"), name: "Budi", role: "kasir" },
    ]);
    const owner = await staffLogin("Pak Ahmad", "999999");
    expect(owner.status).toBe(401);
    expect(await code(owner)).toBe("PIN_INVALID");
    expect(mockDb.get().staffSession).toBeNull();
  });

  test("percobaan pemilik tidak dihitung ke kunci PIN staf", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await staffLogin("Pak Ahmad", "999999");
      expect(res.status).toBe(401);
    }
    expect(mockDb.get().staffPinFailures).toEqual({});
  });

  test("PIN salah → 401 PIN_INVALID; userId tak dikenal → 401; body salah → 422", async () => {
    const wrong = await staffLogin("Rina", "000000");
    expect(wrong.status).toBe(401);
    expect(await code(wrong)).toBe("PIN_INVALID");
    const unknown = await post("/api/staff/login", {
      userId: "x",
      pin: "123456",
    });
    expect(unknown.status).toBe(401);
    expect(await code(unknown)).toBe("PIN_INVALID");
    const bad = await post("/api/staff/login", { userId: userId("Rina") });
    expect(bad.status).toBe(422);
    expect(await code(bad)).toBe("VALIDATION");
    expect((await staffLogin("Rina", "12")).status).toBe(422);
    expect(mockDb.get().staffSession).toBeNull();
  });
});

describe("kunci PIN realm staf terpisah dari kasir (R9)", () => {
  test("5x salah di HP → 423 di HP sampai 5 menit lewat; login PC kasir tetap bisa", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
    for (let i = 0; i < 4; i++) {
      const res = await staffLogin("Rina", "000000");
      expect(res.status).toBe(401);
      expect(await code(res)).toBe("PIN_INVALID");
    }
    const fifth = await staffLogin("Rina", "000000");
    expect(fifth.status).toBe(423);
    const locked = await staffLogin();
    expect(locked.status).toBe(423);
    expect(await locked.json()).toMatchObject({
      code: "LOCKED_OUT",
      detail: "Coba lagi dalam 5 menit",
    });
    expect(mockDb.get().pinFailures).toEqual({});
    // PC kasir tidak terkunci.
    expect((await login("123456")).status).toBe(200);
    vi.setSystemTime(1_700_000_000_000 + 300_000);
    expect((await staffLogin()).status).toBe(200);
  });

  test("5x salah di PC kasir → 423 di PC; login HP tetap bisa", async () => {
    for (let i = 0; i < 5; i++) await login("000000");
    expect((await login("123456")).status).toBe(423);
    expect(mockDb.get().staffPinFailures).toEqual({});
    expect((await staffLogin()).status).toBe(200);
  });

  test("4x salah di HP + 1x salah di PC → keduanya belum terkunci", async () => {
    for (let i = 0; i < 4; i++) await staffLogin("Rina", "000000");
    const pc = await login("000000");
    expect(pc.status).toBe(401);
    expect(await code(pc)).toBe("PIN_INVALID");
    expect((await login("123456")).status).toBe(200);
    expect((await staffLogin()).status).toBe(200);
  });

  test("login staf sukses mereset hitungan staf; kunci per akun", async () => {
    for (let i = 0; i < 4; i++) await staffLogin("Rina", "000000");
    expect((await staffLogin()).status).toBe(200);
    expect(mockDb.get().staffPinFailures).toEqual({});
    for (let i = 0; i < 5; i++) await staffLogin("Rina", "000000");
    expect((await staffLogin()).status).toBe(423);
    expect((await staffLogin("Budi", "654321")).status).toBe(200);
  });

  test("setelah kunci staf kedaluwarsa hitungan mulai dari nol", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
    for (let i = 0; i < 5; i++) await staffLogin("Rina", "000000");
    vi.setSystemTime(1_700_000_000_000 + 300_000);
    for (let i = 0; i < 4; i++)
      expect((await staffLogin("Rina", "000000")).status).toBe(401);
    expect((await staffLogin("Rina", "000000")).status).toBe(423);
  });
});

/** Semua endpoint staf di kontrak, termasuk yang handlernya dibuat task lain. */
const STAFF_REQUESTS: [
  string,
  (h: Record<string, string>) => Promise<Response>,
][] = [
  ["GET users", (h) => get("/api/staff/users", h)],
  [
    "POST login",
    (h) =>
      post("/api/staff/login", { userId: userId("Rina"), pin: "123456" }, h),
  ],
  ["GET session", (h) => get("/api/staff/session", h)],
  ["POST logout", (h) => post("/api/staff/logout", {}, h)],
  ["GET shift", (h) => get("/api/staff/shift", h)],
  ["GET products", (h) => get("/api/staff/products?q=indomie", h)],
  ["GET suppliers", (h) => get("/api/staff/suppliers", h)],
  ["POST receipts", (h) => post("/api/staff/receipts", {}, h)],
  ["GET receipts", (h) => get("/api/staff/receipts", h)],
  ["GET receipts/x", (h) => get("/api/staff/receipts/x", h)],
  ["PUT receipts/x", (h) => put("/api/staff/receipts/x", {}, h)],
  ["PUT receipt-photos/x", (h) => put("/api/staff/receipt-photos/x", {}, h)],
  ["GET receipt-photos/x", (h) => get("/api/staff/receipt-photos/x", h)],
];

describe("header terowongan", () => {
  test.each(TUNNEL_HEADERS)(
    "header %s → 403 STAFF_LAN_ONLY di semua endpoint staf, termasuk login dan dengan sesi sah",
    async (h) => {
      expect((await staffLogin()).status).toBe(200);
      const before = mockDb.get();
      for (const [name, send] of STAFF_REQUESTS) {
        const res = await send({ [h]: "203.0.113.7" });
        expect({ name, status: res.status }).toEqual({ name, status: 403 });
        expect(res.headers.get("Content-Type")).toContain("problem+json");
        expect({ name, body: await res.json() }).toMatchObject({
          name,
          body: {
            code: "STAFF_LAN_ONLY",
            detail: "Hanya bisa dipakai di Wi-Fi toko",
          },
        });
      }
      // Tidak ada yang berubah: login tidak membuat sesi, logout tidak menghapusnya.
      expect(mockDb.get()).toEqual(before);
    },
  );

  test("staffRealm menolak header terowongan tanpa memanggil resolver; tanpa header diteruskan", async () => {
    const resolver = vi.fn(() => HttpResponse.json({ ok: true }));
    const wrapped = staffRealm<HttpResponseResolver>(resolver);
    const call = (headers: Record<string, string>) =>
      wrapped({
        request: new Request("http://toko.lan/api/staff/receipts", { headers }),
        params: {},
        cookies: {},
        requestId: "r1",
      } as unknown as Parameters<HttpResponseResolver>[0]);
    for (const h of TUNNEL_HEADERS) {
      const res = (await call({ [h]: "x" })) as Response;
      expect(res.status).toBe(403);
      expect(await code(res)).toBe("STAFF_LAN_ONLY");
    }
    expect(resolver).not.toHaveBeenCalled();
    const ok = (await call({})) as Response;
    expect(await ok.json()).toEqual({ ok: true });
    expect(resolver).toHaveBeenCalledOnce();
  });

  test("header huruf besar, query string, dan garis miring akhir tetap ditolak", async () => {
    const res = await get("/api/staff/products/?q=x", { "CF-RAY": "1" });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("STAFF_LAN_ONLY");
  });

  test("header terowongan dicek sebelum skenario server-mati", async () => {
    setScenario("server-mati");
    const res = await get("/api/staff/users", { "Cf-Ray": "8a1b2c3d4e5f" });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("STAFF_LAN_ONLY");
  });

  test("header terowongan tidak memengaruhi realm kasir", async () => {
    const res = await get("/api/users/kasir", {
      "Cf-Connecting-Ip": "1.2.3.4",
    });
    expect(res.status).toBe(200);
  });
});

describe("realm terpisah", () => {
  test("tanpa sesi staf → 401 walau sesi kasir & pemilik aktif", async () => {
    expect((await login("123456")).status).toBe(200);
    expect((await ownerLogin()).status).toBe(200);
    for (const path of [
      "/api/staff/session",
      "/api/staff/shift",
      "/api/staff/products?q=indomie",
      "/api/staff/suppliers",
    ]) {
      const res = await get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 401 });
      expect(await res.json()).toMatchObject({
        code: "UNAUTHORIZED",
        detail: "Sesi orang toko tidak ditemukan",
      });
    }
  });

  test("sesi staf milik akun yang bukan kasir → 401", async () => {
    mockDb.update((s) => {
      s.staffSession = { userId: userId("Pak Ahmad") };
    });
    expect((await get("/api/staff/session")).status).toBe(401);
  });
});

describe("shift laci", () => {
  test("shift: tanpa shift → {shift:null}; Rina buka shift 1.500.000 → {shift:{kasirName:'Rina', openedAt}} tanpa angka kas", async () => {
    await staffLogin("Budi", "654321");
    expect(await json<StaffShift>(await get("/api/staff/shift"))).toEqual({
      shift: null,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_793_590_000_000);
    await login("123456");
    expect((await post("/api/shifts", { openingCash: 1_500_000 })).status).toBe(
      201,
    );
    expect(mockDb.get().shift?.cashOuts).toEqual([]);
    expect(await json<StaffShift>(await get("/api/staff/shift"))).toEqual({
      shift: { kasirName: "Rina", openedAt: 1_793_590_000_000 },
    });
  });
});

describe("cari barang", () => {
  test("cari: 'indomie' → Indomie {category:'Mi Instan', status:'aktif', units:[{name:'pcs',unitSize:1,barcodes:['089686010947']},{name:'dus',unitSize:40,barcodes:['189686010944']}]}", async () => {
    await staffLogin();
    const product = mockDb.get().products.find((p) => p.name === INDOMIE);
    const found = await search("indomie");
    // Indomie lain di katalog buatan ikut cocok; semuanya mengandung "indomie".
    expect(found.every((p) => p.name.toLowerCase().includes("indomie"))).toBe(
      true,
    );
    expect(found.find((p) => p.name === INDOMIE)).toEqual({
      id: product?.id,
      name: INDOMIE,
      category: "Mi Instan",
      isCurah: false,
      baseUnit: "pcs",
      status: "aktif",
      units: [
        {
          id: unitOf(INDOMIE, "pcs").id,
          name: "pcs",
          unitSize: 1,
          barcodes: ["089686010947"],
        },
        {
          id: unitOf(INDOMIE, "dus").id,
          name: "dus",
          unitSize: 40,
          barcodes: ["189686010944"],
        },
      ],
    });
  });

  test("cari: '089686010947' & '1001' → Indomie; 'i' → []; Bimoli nonaktif → 'bimoli' []; satuan nonaktif dibuang; maks 20", async () => {
    await staffLogin();
    expect(names(await search("089686010947"))).toEqual([INDOMIE]);
    expect(names(await search("189686010944"))).toEqual([INDOMIE]);
    expect(names(await search(" 1001 "))).toEqual([INDOMIE]);
    expect(names(await search("INDOMIE goreng"))).toEqual([INDOMIE]);
    expect(await search("i")).toEqual([]);
    expect(await search("  ")).toEqual([]);
    // Barcode/kode harus persis; potongan angka tidak cocok.
    expect(await search("0896860109")).toEqual([]);

    expect(names(await search("bimoli"))).toEqual([BIMOLI]);
    updateProduct(BIMOLI, (p) => {
      p.status = "nonaktif";
    });
    expect(await search("bimoli")).toEqual([]);
    expect(await search("8992696404441")).toEqual([]);

    updateProduct(INDOMIE, (p) => {
      for (const u of p.units) if (u.name === "dus") u.active = false;
    });
    const [indomie] = await search("indomie goreng");
    expect(indomie?.units.map((u) => u.name)).toEqual(["pcs"]);
    expect(await search("189686010944")).toEqual([]);

    mockDb.update((s) => {
      const base = s.products.find((p) => p.name === INDOMIE);
      if (!base) throw new Error("seed tanpa Indomie");
      for (let i = 25; i >= 1; i--) {
        const id = `uji-${i}`;
        s.products.push({
          ...base,
          id,
          name: `Barang Uji ${String(i).padStart(2, "0")}`,
          storeCode: `9${i}`,
          units: [
            {
              ...unitOf(INDOMIE, "pcs"),
              active: true,
              id: `${id}-u`,
              productId: id,
              barcodes: [],
            },
          ],
        });
      }
    });
    const many = await search("barang uji");
    expect(many).toHaveLength(20);
    expect(many[0]?.name).toBe("Barang Uji 01");
    expect(many[19]?.name).toBe("Barang Uji 20");
  });

  test("cari: barang menunggu harga & tidak diambil ikut; urut nama", async () => {
    await staffLogin();
    updateProduct(INDOMIE, (p) => {
      p.status = "menunggu_harga";
    });
    updateProduct(BIMOLI, (p) => {
      p.status = "tidak_diambil";
    });
    expect((await search("indomie goreng"))[0]?.status).toBe("menunggu_harga");
    expect((await search("bimoli"))[0]?.status).toBe("tidak_diambil");
    const result = names(await search("beras"));
    expect(result).toEqual(
      [...result].sort((a, b) => a.localeCompare(b, "id")),
    );
    expect(result).toEqual(
      expect.arrayContaining(["Beras", "Beras Pandan Wangi 5 kg"]),
    );
  });
});

describe("supplier", () => {
  test("suppliers awal []", async () => {
    await staffLogin();
    expect(await json<unknown[]>(await get("/api/staff/suppliers"))).toEqual(
      [],
    );
  });

  test("suppliers urut terakhir dipakai dulu, tanpa lastUsedAt", async () => {
    await staffLogin();
    mockDb.update((s) => {
      s.suppliers.push(
        { id: "s1", name: "CV Sumber Rejeki", lastUsedAt: 100 },
        { id: "s2", name: "Toko Grosir Jaya", lastUsedAt: 300 },
        { id: "s3", name: "UD Makmur", lastUsedAt: 200 },
      );
    });
    expect(await json<unknown[]>(await get("/api/staff/suppliers"))).toEqual([
      { id: "s2", name: "Toko Grosir Jaya" },
      { id: "s3", name: "UD Makmur" },
      { id: "s1", name: "CV Sumber Rejeki" },
    ]);
  });
});

test("respons staf tidak memuat FORBIDDEN_STAFF_KEYS (deepKeys) — users, session, shift, products, suppliers", async () => {
  await login("123456");
  await post("/api/shifts", { openingCash: 1_500_000 });
  mockDb.update((s) => {
    s.suppliers.push({ id: "s1", name: "CV Sumber Rejeki", lastUsedAt: 1 });
  });
  const loginRes = await staffLogin();
  const bodies: [string, unknown][] = [["login", await loginRes.json()]];
  for (const path of [
    "/api/staff/users",
    "/api/staff/session",
    "/api/staff/shift",
    "/api/staff/products?q=indomie",
    "/api/staff/products?q=beras",
    "/api/staff/suppliers",
  ]) {
    const res = await get(path);
    expect({ path, status: res.status }).toEqual({ path, status: 200 });
    bodies.push([path, await res.json()]);
  }
  for (const [path, body] of bodies) {
    const keys = deepKeys(body);
    // Penjaga: penelusuran menemukan key bersarang.
    expect(keys.size).toBeGreaterThan(0);
    expect({
      path,
      leaked: FORBIDDEN_STAFF_KEYS.filter((k) => keys.has(k)),
    }).toEqual({ path, leaked: [] });
  }
  expect(deepKeys(bodies[4]?.[1])).toContain("barcodes");
  expect(deepKeys({ a: [{ b: { cost: 1 } }] })).toEqual(
    new Set(["a", "b", "cost"]),
  );
});
