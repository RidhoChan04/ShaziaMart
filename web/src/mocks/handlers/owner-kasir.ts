import { HttpResponse, http } from "msw";
import type { OwnerKasirAccount } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { type MockState, type MockUser, mockDb } from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/kasir-accounts";
const NAME_MAX = 30;
const PIN = /^\d{6}$/;

/** Akhir kunci PIN yang masih berlaku, terlama dari dua realm (PC kasir & HP toko). */
function lockedUntilOf(
  state: Readonly<MockState>,
  userId: string,
  now: number,
): number | null {
  const ends = [
    state.pinFailures[userId]?.lockedUntil,
    state.staffPinFailures[userId]?.lockedUntil,
  ].filter((t): t is number => typeof t === "number" && t > now);
  return ends.length === 0 ? null : Math.max(...ends);
}

const toAccount = (
  state: Readonly<MockState>,
  user: MockUser,
): OwnerKasirAccount => ({
  id: user.id,
  name: user.name,
  active: user.active,
  onShift: state.shift?.kasirId === user.id,
  lockedUntil: lockedUntilOf(state, user.id, Date.now()),
});

/** Akun kasir ber-id ini; pemilik tidak pernah dianggap akun kasir. */
const findKasir = (
  state: Readonly<MockState>,
  userId: string,
): MockUser | undefined =>
  state.users.find((u) => u.id === userId && u.role === "kasir");

/** Nama 1..30 karakter setelah trim, atau null. */
function readName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX ? name : null;
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase("id") === b.trim().toLocaleLowerCase("id");

/** (K12) Nama dipakai pengguna lain (termasuk pemilik), tanpa beda huruf besar/kecil. */
const nameTaken = (
  state: Readonly<MockState>,
  name: string,
  exceptId: string | null,
): boolean =>
  state.users.some((u) => u.id !== exceptId && sameName(u.name, name));

const isPin = (v: unknown): v is string => typeof v === "string" && PIN.test(v);

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Akun kasir tidak ditemukan");
const nameTakenProblem = (): Response =>
  problem(409, "NAME_TAKEN", "Nama sudah dipakai");
const NAME_INVALID = "Nama 1–30 karakter";
const PIN_INVALID = "PIN harus 6 angka";

/** Respons akun setelah perubahan tersimpan. */
function savedAccount(userId: string): OwnerKasirAccount {
  const state = mockDb.get();
  const user = findKasir(state, userId);
  if (!user) throw new Error("Akun kasir hilang");
  return toAccount(state, user);
}

export const ownerKasirHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const accounts = state.users
        .filter((u) => u.role === "kasir")
        .sort((a, b) => a.name.localeCompare(b.name, "id"))
        .map((u) => toAccount(state, u));
      return HttpResponse.json(accounts);
    }),
  ),
  http.post(
    BASE,
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const name = readName(body?.name);
      if (name === null) return invalid(NAME_INVALID);
      const pin = body?.pin;
      if (!isPin(pin)) return invalid(PIN_INVALID);
      // Klik ganda: permintaan kedua bertemu nama yang baru dibuat → 409.
      if (nameTaken(state, name, null)) return nameTakenProblem();
      const user: MockUser = {
        id: newId(),
        name,
        role: "kasir",
        pin,
        active: true,
      };
      mockDb.update((s) => {
        s.users.push(user);
      });
      return HttpResponse.json(savedAccount(user.id), { status: 201 });
    }),
  ),
  http.patch(
    `${BASE}/:userId`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const id = String(params.userId);
      const user = findKasir(state, id);
      if (!user) return notFound();
      if (body === null) return invalid("Isi perubahan akun tidak valid");
      let name: string | undefined;
      if (Object.hasOwn(body, "name")) {
        const read = readName(body.name);
        if (read === null) return invalid(NAME_INVALID);
        name = read;
      }
      const { active } = body;
      if (Object.hasOwn(body, "active") && typeof active !== "boolean") {
        return invalid("Status aktif harus true atau false");
      }
      if (name !== undefined && nameTaken(state, name, id)) {
        return nameTakenProblem();
      }
      if (active === false && state.shift?.kasirId === id) {
        return problem(409, "KASIR_ON_SHIFT", `Tutup shift ${user.name} dulu`);
      }
      mockDb.update((s) => {
        const target = s.users.find((u) => u.id === id);
        if (!target) throw new Error("Akun kasir hilang");
        // Salinan nama lama (shift, penjualan, nota) tidak diubah.
        if (name !== undefined) target.name = name;
        if (typeof active === "boolean") target.active = active;
        if (active === false) {
          // Sesi kasir & HP toko orang itu putus; requireSession juga menolak (K22).
          if (s.session?.userId === id) s.session = null;
          if (s.staffSession?.userId === id) s.staffSession = null;
        }
      });
      return HttpResponse.json(savedAccount(id));
    }),
  ),
  http.post(
    `${BASE}/:userId/pin`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const id = String(params.userId);
      if (!findKasir(state, id)) return notFound();
      const pin = body?.pin;
      if (!isPin(pin)) return invalid(PIN_INVALID);
      mockDb.update((s) => {
        const target = s.users.find((u) => u.id === id);
        if (!target) throw new Error("Akun kasir hilang");
        target.pin = pin;
        // Kunci & hitungan PIN salah dikosongkan di kedua realm.
        delete s.pinFailures[id];
        delete s.staffPinFailures[id];
      });
      return HttpResponse.json(savedAccount(id));
    }),
  ),
];
