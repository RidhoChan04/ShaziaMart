import { expect, test } from "vitest";
import { ID_TAKEN_MESSAGE } from "@/shared/lib/error-messages";
import { makeDraft } from "./form-test-kit";
import { derivedId, isIdTaken, renewIds } from "./resend";

const rejected = (message: string) => ({
  ...makeDraft(),
  status: "rejected" as const,
  errors: [{ lineId: null, field: "lines" as const, message }],
});

test("isIdTaken: hanya draf ditolak dengan pesan ID_TAKEN", () => {
  expect(isIdTaken(rejected(ID_TAKEN_MESSAGE))).toBe(true);
  expect(isIdTaken(rejected("Nota tidak valid"))).toBe(false);
  expect(isIdTaken({ ...rejected(ID_TAKEN_MESSAGE), status: "queued" })).toBe(
    false,
  );
});

test("renewIds: ID nota dan foto baru, antre, galat kosong, isi tetap, foto belum terunggah", () => {
  const d = {
    ...rejected(ID_TAKEN_MESSAGE),
    photo: {
      id: "foto-lama",
      blob: new Blob(["x"]),
      takenAt: 1,
      bytes: 1,
      uploaded: true,
    },
  };
  const n = renewIds(d, 5);
  expect(n.id).not.toBe(d.id);
  expect(n.photo?.id).not.toBe("foto-lama");
  expect(n.photo?.uploaded).toBe(false);
  expect(n.photo?.blob).toBe(d.photo.blob);
  expect(n).toMatchObject({
    status: "queued",
    errors: [],
    createdAt: d.createdAt,
  });
  expect(n.form).toBe(d.form);
});

test("derivedId: tetap untuk masukan sama, beda dari asal, dalam batas 64 karakter; terlalu panjang → ID acak sah", () => {
  const uuid = "019a4c1e-7b2d-7a31-9c55-0123456789ab";
  expect(derivedId(uuid, 1)).toBe(derivedId(uuid, 99));
  expect(derivedId(uuid, 1)).not.toBe(uuid);
  expect(derivedId(uuid, 1).length).toBeLessThanOrEqual(64);
  // ID_TAKEN lagi pada ID turunan: turunan berikutnya berbeda.
  expect(derivedId(derivedId(uuid, 1), 1)).not.toBe(derivedId(uuid, 1));
  const long = "x".repeat(63);
  const fallback = derivedId(long, 5);
  expect(fallback.length).toBeLessThanOrEqual(64);
  expect(fallback).not.toBe(long);
});

test("renewIds dua kali dari draf lama yang sama → ID nota dan foto sama", () => {
  const d = {
    ...rejected(ID_TAKEN_MESSAGE),
    photo: {
      id: "foto-lama",
      blob: new Blob(["x"]),
      takenAt: 1,
      bytes: 1,
      uploaded: true,
    },
  };
  const a = renewIds(d, 1);
  const b = renewIds(d, 2);
  expect(b.id).toBe(a.id);
  expect(b.photo?.id).toBe(a.photo?.id);
});
