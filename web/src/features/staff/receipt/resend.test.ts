import { expect, test } from "vitest";
import { ID_TAKEN_MESSAGE } from "@/shared/lib/error-messages";
import { makeDraft } from "./form-test-kit";
import { isIdTaken, renewIds } from "./resend";

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
