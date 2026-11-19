import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerKasirAccount,
  Problem,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  CreateOwnerKasirAccountResponse,
  ListOwnerKasirAccountsResponse,
  ResetOwnerKasirPinResponse,
  UpdateOwnerKasirAccountResponse,
} from "@/shared/api/gen/zod/owner/owner";
import { mockDb } from "../db";
import { LOCK_MS, MAX_FAILURES } from "./respond";
import {
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
  staffLogin,
  userId,
} from "./test-helpers";

/** Kamis 5 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);

const BASE = "/api/owner/kasir-accounts";

const patchAccount = (id: string, body: unknown): Promise<Response> =>
  fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const resetPin = (id: string, pin: unknown) =>
  post(`${BASE}/${id}/pin`, { pin });

const accounts = async (): Promise<OwnerKasirAccount[]> => {
  const res = await get(BASE);
  expect(res.status).toBe(200);
  return ListOwnerKasirAccountsResponse.parse(
    await json<OwnerKasirAccount[]>(res),
  );
};

const kasirNames = async () =>
  (await json<User[]>(await get("/api/users/kasir"))).map((u) => u.name);
const staffNames = async () =>
  (await json<User[]>(await get("/api/staff/users"))).map((u) => u.name);

const codeOf = async (res: Response) => (await json<Problem>(res)).code;

/** `n` kali PIN salah di realm kasir (PC) atau HP toko. */
async function wrongPins(name: string, realm: "pc" | "hp", n = MAX_FAILURES) {
  for (let i = 0; i < n; i++) {
    if (realm === "pc") await login("000000", name);
    else await staffLogin(name, "000000");
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("tanpa sesi pemilik", () => {
  test("semua endpoint akun kasir → 401 (sesi kasir/staf tidak berlaku)", async () => {
    expect((await login("123456")).status).toBe(200);
    expect((await staffLogin()).status).toBe(200);
    const rina = userId("Rina");
    expect((await get(BASE)).status).toBe(401);
    expect((await post(BASE, { name: "Sari", pin: "111111" })).status).toBe(
      401,
    );
    expect((await patchAccount(rina, { active: false })).status).toBe(401);
    expect((await resetPin(rina, "111111")).status).toBe(401);
    expect(mockDb.get().users.map((u) => u.name)).toEqual([
      "Rina",
      "Budi",
      "Pak Ahmad",
    ]);
  });
});

describe("listOwnerKasirAccounts", () => {
  test("hanya kasir, urut nama, tanpa PIN; onShift & lockedUntil terlama dari dua realm", async () => {
    await loginWithShift();
    await wrongPins("Budi", "hp");
    vi.setSystemTime(NOW + 60_000);
    await wrongPins("Budi", "pc");
    expect((await ownerLogin()).status).toBe(200);
    const list = await accounts();
    expect(list).toEqual([
      {
        id: userId("Budi"),
        name: "Budi",
        active: true,
        onShift: false,
        lockedUntil: NOW + 60_000 + LOCK_MS,
      },
      {
        id: userId("Rina"),
        name: "Rina",
        active: true,
        onShift: true,
        lockedUntil: null,
      },
    ]);
    // Kunci yang sudah lewat tidak dilaporkan.
    vi.setSystemTime(NOW + 60_000 + LOCK_MS + 1);
    expect((await accounts())[0]?.lockedUntil).toBeNull();
  });
});

describe("createOwnerKasirAccount (K12)", () => {
  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
  });

  test("akun baru aktif, nama di-trim, langsung muncul di PC & HP toko, bisa login PIN", async () => {
    const res = await post(BASE, { name: "  Sari ", pin: "111111" });
    expect(res.status).toBe(201);
    const body = CreateOwnerKasirAccountResponse.parse(
      await json<OwnerKasirAccount>(res),
    );
    expect(body).toEqual({
      id: expect.any(String),
      name: "Sari",
      active: true,
      onShift: false,
      lockedUntil: null,
    });
    expect(Object.keys(body)).not.toContain("pin");
    expect(mockDb.get().users.find((u) => u.id === body.id)).toMatchObject({
      role: "kasir",
      pin: "111111",
      active: true,
    });
    expect(await kasirNames()).toContain("Sari");
    expect(await staffNames()).toContain("Sari");
    expect((await login("111111", "Sari")).status).toBe(200);
    expect((await staffLogin("Sari", "111111")).status).toBe(200);
    expect((await accounts()).map((a) => a.name)).toEqual([
      "Budi",
      "Rina",
      "Sari",
    ]);
  });

  test("nama sudah dipakai (tanpa beda huruf besar/kecil, termasuk pemilik) → 409 NAME_TAKEN; klik ganda → 409", async () => {
    for (const name of [" rina ", "BUDI", "pak ahmad"]) {
      const res = await post(BASE, { name, pin: "111111" });
      expect(res.status, name).toBe(409);
      expect(await codeOf(res)).toBe("NAME_TAKEN");
    }
    expect((await post(BASE, { name: "Sari", pin: "111111" })).status).toBe(
      201,
    );
    const again = await post(BASE, { name: "sari", pin: "222222" });
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe("NAME_TAKEN");
    expect(mockDb.get().users).toHaveLength(4);
  });

  test("PIN bukan 6 angka atau nama kosong/terlalu panjang → 422 VALIDATION", async () => {
    const cases: unknown[] = [
      { name: "Sari", pin: "12345" },
      { name: "Sari", pin: "1234567" },
      { name: "Sari", pin: "12a456" },
      { name: "Sari", pin: 123456 },
      { name: "Sari" },
      { name: "   ", pin: "111111" },
      { name: "x".repeat(31), pin: "111111" },
      { pin: "111111" },
    ];
    for (const body of cases) {
      const res = await post(BASE, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await codeOf(res)).toBe("VALIDATION");
    }
    expect(
      (await post(BASE, { name: "x".repeat(30), pin: "000000" })).status,
    ).toBe(201);
    expect(mockDb.get().users).toHaveLength(4);
  });
});

describe("updateOwnerKasirAccount (K12, K22)", () => {
  test("nonaktifkan kasir yang memegang shift buka → 409 KASIR_ON_SHIFT, tidak berubah", async () => {
    await loginWithShift();
    expect((await ownerLogin()).status).toBe(200);
    const res = await patchAccount(userId("Rina"), { active: false });
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("KASIR_ON_SHIFT");
    const s = mockDb.get();
    expect(s.users.find((u) => u.name === "Rina")?.active).toBe(true);
    expect(s.session).toEqual({ userId: userId("Rina") });
    expect(s.shift?.kasirName).toBe("Rina");
  });

  test("nonaktifkan Budi: sesi HP toko putus, hilang dari daftar, login PIN 401 tanpa hitungan kunci; aktifkan lagi → bisa login", async () => {
    const budi = userId("Budi");
    expect((await staffLogin("Budi", "654321")).status).toBe(200);
    expect((await ownerLogin()).status).toBe(200);

    const res = await patchAccount(budi, { active: false });
    expect(res.status).toBe(200);
    expect(
      UpdateOwnerKasirAccountResponse.parse(await json<OwnerKasirAccount>(res)),
    ).toEqual({
      id: budi,
      name: "Budi",
      active: false,
      onShift: false,
      lockedUntil: null,
    });
    expect(mockDb.get().staffSession).toBeNull();
    expect((await get("/api/staff/session")).status).toBe(401);
    expect(await kasirNames()).toEqual(["Rina"]);
    expect(await staffNames()).toEqual(["Rina"]);
    // Pemilik tetap melihat akun nonaktif.
    expect((await accounts()).map((a) => [a.name, a.active])).toEqual([
      ["Budi", false],
      ["Rina", true],
    ]);

    for (const attempt of [
      () => login("654321", "Budi"),
      () => login("000000", "Budi"),
      () => staffLogin("Budi", "654321"),
      () => staffLogin("Budi", "000000"),
    ]) {
      const denied = await attempt();
      expect(denied.status).toBe(401);
      expect(await codeOf(denied)).toBe("PIN_INVALID");
    }
    const s = mockDb.get();
    expect(s.pinFailures[budi]).toBeUndefined();
    expect(s.staffPinFailures[budi]).toBeUndefined();
    expect(s.session).toBeNull();

    expect((await patchAccount(budi, { active: true })).status).toBe(200);
    expect(await kasirNames()).toEqual(["Rina", "Budi"]);
    expect((await login("654321", "Budi")).status).toBe(200);
    expect((await staffLogin("Budi", "654321")).status).toBe(200);
  });

  test("Rina masuk di PC tanpa shift lalu dinonaktifkan → request kasir berikutnya 401", async () => {
    expect((await login("123456")).status).toBe(200);
    expect((await get("/api/sales/shift")).status).toBe(200);
    expect((await ownerLogin()).status).toBe(200);
    expect((await patchAccount(userId("Rina"), { active: false })).status).toBe(
      200,
    );
    expect(mockDb.get().session).toBeNull();
    expect((await get("/api/sales/shift")).status).toBe(401);
    expect((await get("/api/auth/session")).status).toBe(401);
  });

  test("(K22) sesi yang masih tersimpan milik pengguna nonaktif ditolak requireSession & requireStaffSession", async () => {
    expect((await login("123456")).status).toBe(200);
    expect((await staffLogin()).status).toBe(200);
    mockDb.update((s) => {
      const rina = s.users.find((u) => u.name === "Rina");
      if (rina) rina.active = false;
    });
    expect(mockDb.get().session).not.toBeNull();
    expect((await get("/api/auth/session")).status).toBe(401);
    expect((await get("/api/sales/shift")).status).toBe(401);
    expect((await get("/api/staff/session")).status).toBe(401);
    expect((await get("/api/staff/suppliers")).status).toBe(401);
  });

  test("ganti nama: di-trim, tidak mengubah salinan nama lama; nama orang lain → 409; nama sendiri beda huruf boleh", async () => {
    await loginWithShift();
    await post("/api/shifts/current/close", { countedCash: 200_000 });
    expect((await ownerLogin()).status).toBe(200);
    const rina = userId("Rina");

    const taken = await patchAccount(rina, { name: " budi " });
    expect(taken.status).toBe(409);
    expect(await codeOf(taken)).toBe("NAME_TAKEN");
    const owner = await patchAccount(rina, { name: "PAK AHMAD" });
    expect(owner.status).toBe(409);

    const res = await patchAccount(rina, { name: " Rini " });
    expect(res.status).toBe(200);
    expect((await json<OwnerKasirAccount>(res)).name).toBe("Rini");
    expect((await patchAccount(rina, { name: "RINI" })).status).toBe(200);
    const s = mockDb.get();
    expect(s.users.find((u) => u.id === rina)?.name).toBe("RINI");
    expect(s.closedShifts.at(-1)?.kasirName).toBe("Rina");
    expect(await kasirNames()).toContain("RINI");
  });

  test("urutan cek: id tidak dikenal / pemilik → 404; nama atau active salah tipe → 422", async () => {
    expect((await ownerLogin()).status).toBe(200);
    for (const id of ["tidak-ada", userId("Pak Ahmad")]) {
      const res = await patchAccount(id, { name: "" });
      expect(res.status, id).toBe(404);
      expect(await codeOf(res)).toBe("NOT_FOUND");
    }
    const rina = userId("Rina");
    for (const body of [
      { name: "" },
      { name: "   " },
      { name: "x".repeat(31) },
      { name: 5 },
      { active: "false" },
      { active: null },
      null,
    ]) {
      const res = await patchAccount(rina, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await codeOf(res)).toBe("VALIDATION");
    }
    // Nama tidak sah dicek sebelum KASIR_ON_SHIFT; tanpa field = tidak berubah.
    expect((await patchAccount(rina, {})).status).toBe(200);
    expect(mockDb.get().users.find((u) => u.id === rina)).toMatchObject({
      name: "Rina",
      active: true,
    });
  });

  test("ganti nama saat kasir memegang shift buka: salinan kasirName shift tetap nama lama, akun memakai nama baru", async () => {
    await loginWithShift();
    expect((await ownerLogin()).status).toBe(200);
    const rina = userId("Rina");
    const res = await patchAccount(rina, { name: "Rini" });
    expect(res.status).toBe(200);
    expect(await json<OwnerKasirAccount>(res)).toMatchObject({
      name: "Rini",
      onShift: true,
    });
    expect(mockDb.get().shift).toMatchObject({
      kasirId: rina,
      kasirName: "Rina",
    });
    expect((await accounts()).find((a) => a.id === rina)?.name).toBe("Rini");
    // Sesi kasir tetap berlaku (bukan penonaktifan).
    expect((await get("/api/auth/session")).status).toBe(200);
  });
});

describe("realm kasir (PC) hanya untuk akun kasir", () => {
  test("id pemilik + PIN benar → 401 PIN_INVALID tanpa sesi kasir", async () => {
    const res = await login("999999", "Pak Ahmad");
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("PIN_INVALID");
    const s = mockDb.get();
    expect(s.session).toBeNull();
    expect(s.pinFailures[userId("Pak Ahmad")]).toBeUndefined();
  });

  test("id pemilik + PIN salah berulang → 401, hitungan kunci pemilik tidak bertambah", async () => {
    const owner = userId("Pak Ahmad");
    for (let i = 0; i < MAX_FAILURES + 1; i++) {
      const res = await login("000000", "Pak Ahmad");
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe("PIN_INVALID");
    }
    expect(mockDb.get().pinFailures[owner]).toBeUndefined();
  });

  test("sesi kasir tersimpan ber-id pemilik ditolak requireSession", async () => {
    mockDb.update((s) => {
      s.session = { userId: userId("Pak Ahmad") };
    });
    expect((await get("/api/auth/session")).status).toBe(401);
    expect((await get("/api/sales/shift")).status).toBe(401);
  });
});

describe("resetOwnerKasirPin (K12)", () => {
  test("PIN baru berlaku; kunci & hitungan PIN salah kedua realm dikosongkan; PIN tidak dikirim balik", async () => {
    const rina = userId("Rina");
    await wrongPins("Rina", "pc");
    await wrongPins("Rina", "hp");
    expect((await ownerLogin()).status).toBe(200);
    expect((await accounts()).find((a) => a.id === rina)?.lockedUntil).toBe(
      NOW + LOCK_MS,
    );

    const res = await resetPin(rina, "222222");
    expect(res.status).toBe(200);
    const body = ResetOwnerKasirPinResponse.parse(
      await json<OwnerKasirAccount>(res),
    );
    expect(body).toEqual({
      id: rina,
      name: "Rina",
      active: true,
      onShift: false,
      lockedUntil: null,
    });
    const s = mockDb.get();
    expect(s.pinFailures[rina]).toBeUndefined();
    expect(s.staffPinFailures[rina]).toBeUndefined();

    expect((await login("123456")).status).toBe(401);
    expect((await login("222222")).status).toBe(200);
    expect((await staffLogin("Rina", "222222")).status).toBe(200);
  });

  test("PIN bukan 6 angka → 422; id tidak dikenal atau pemilik → 404", async () => {
    expect((await ownerLogin()).status).toBe(200);
    const rina = userId("Rina");
    for (const pin of ["12345", "abcdef", 123456, null]) {
      const res = await resetPin(rina, pin);
      expect(res.status, String(pin)).toBe(422);
      expect(await codeOf(res)).toBe("VALIDATION");
    }
    expect(mockDb.get().users.find((u) => u.id === rina)?.pin).toBe("123456");
    for (const id of ["tidak-ada", userId("Pak Ahmad")]) {
      expect((await resetPin(id, "111111")).status).toBe(404);
    }
    expect(mockDb.get().users.find((u) => u.name === "Pak Ahmad")?.pin).toBe(
      "999999",
    );
  });
});
