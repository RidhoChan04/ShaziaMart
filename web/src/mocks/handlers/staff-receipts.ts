import { HttpResponse, http } from "msw";
import type {
  ReceiptError,
  StaffReceiptRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockReceipt, mockDb } from "../db";
import { mockPhotos } from "../photos";
import { checkReceipt } from "../receipts/check";
import { applyReceipt } from "../receipts/receive";
import { applyEdit, checkEdit } from "../receipts/revise";
import { toStaffReceipt, toStaffReceiptRow } from "../receipts/views";
import { withScenario } from "../scenarios";
import { readReceiptEdit, readReceiptInput } from "./receipt-body";
import { problem, readJson, requireOwnerSession } from "./respond";
import { requireStaffSession, staffRealm } from "./staff-realm";

const BASE = "/api/staff/receipts";
const PHOTO_MAX_BYTES = 1024 * 1024;

const receiptProblem = (errors: ReceiptError[]): Response =>
  problem(422, "VALIDATION", "Nota tidak valid", { errors });

const idTaken = (): Response =>
  problem(409, "ID_TAKEN", "ID ini sudah dipakai pengguna lain");

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Nota tidak ditemukan");

const jpeg = (bytes: Uint8Array): Response =>
  new HttpResponse(bytes.slice().buffer, {
    headers: { "Content-Type": "image/jpeg" },
  });

/** JPEG diawali penanda SOI FF D8 FF. */
const isJpeg = (b: Uint8Array): boolean =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export const staffReceiptHandlers = [
  http.post(
    BASE,
    staffRealm(async ({ request }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const input = readReceiptInput(await readJson(request));
      if (input === null) return receiptProblem([]);
      // R7: replay hanya untuk pembuatnya, tanpa validasi ulang dan tanpa mencatat ulang.
      const saved = state.receipts.find((r) => r.id === input.id);
      if (saved) {
        return saved.createdById === user.id
          ? HttpResponse.json(toStaffReceipt(state, saved))
          : idTaken();
      }
      const now = Date.now();
      const errors = checkReceipt(state, input, user.id, now);
      if (errors.length > 0) return receiptProblem(errors);
      let created: MockReceipt | null = null;
      mockDb.update((s) => {
        created = applyReceipt(s, input, user, now);
      });
      if (created === null) throw new Error("Nota tidak tersimpan");
      return HttpResponse.json(toStaffReceipt(mockDb.get(), created), {
        status: 201,
      });
    }),
  ),
  http.get(
    BASE,
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const rows: StaffReceiptRow[] = state.receipts
        .filter((r) => r.createdById === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => toStaffReceiptRow(state, r));
      return HttpResponse.json(rows);
    }),
  ),
  http.get(
    `${BASE}/:receiptId`,
    staffRealm(({ params }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const r = state.receipts.find(
        (x) => x.id === String(params.receiptId) && x.createdById === user.id,
      );
      return r ? HttpResponse.json(toStaffReceipt(state, r)) : notFound();
    }),
  ),
  http.put(
    `${BASE}/:receiptId`,
    staffRealm(async ({ params, request }) => {
      const body = await readJson(request);
      // State dibaca sesudah body agar pemeriksaan & penerapan memakai data yang sama.
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const id = String(params.receiptId);
      // K5: hanya pembuatnya; nota orang lain tidak dibedakan dari yang tidak ada.
      const r = state.receipts.find(
        (x) => x.id === id && x.createdById === user.id,
      );
      if (!r) return notFound();
      if (r.status === "dibatalkan") {
        return problem(409, "RECEIPT_CANCELLED", "Nota ini sudah dibatalkan");
      }
      const edit = readReceiptEdit(body);
      if (edit === null) return receiptProblem([]);
      const now = Date.now();
      const errors = checkEdit(state, r, edit, now);
      if (errors.length > 0) return receiptProblem(errors);
      mockDb.update((s) => {
        const target = s.receipts.find((x) => x.id === id);
        if (!target) throw new Error("Nota hilang");
        applyEdit(s, target, edit, user, now);
      });
      const saved = mockDb.get();
      const updated = saved.receipts.find((x) => x.id === id);
      if (!updated) throw new Error("Nota hilang");
      return HttpResponse.json(toStaffReceipt(saved, updated));
    }),
  ),
  http.put(
    "/api/staff/receipt-photos/:photoId",
    staffRealm(async ({ params, request }) => {
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const id = String(params.photoId);
      const bytes = new Uint8Array(await request.arrayBuffer());
      const stored = mockPhotos.load(id);
      // Foto terikat pengunggah: id milik orang lain tidak pernah ditimpa.
      if (stored && stored.ownerId !== user.id) return idTaken();
      if (bytes.length > PHOTO_MAX_BYTES) {
        return problem(
          422,
          "VALIDATION",
          "Foto nota terlalu besar (maks. 1 MB)",
        );
      }
      if (!isJpeg(bytes)) {
        return problem(422, "VALIDATION", "Foto nota harus JPEG");
      }
      // Idempoten: unggah ulang oleh pengunggah yang sama tidak mengubah foto tersimpan.
      if (!stored) mockPhotos.save(id, user.id, bytes);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(
    "/api/staff/receipt-photos/:photoId",
    staffRealm(({ params }) => {
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const stored = mockPhotos.load(String(params.photoId));
      return stored?.ownerId === user.id
        ? jpeg(stored.bytes)
        : problem(404, "NOT_FOUND", "Foto nota tidak ditemukan");
    }),
  ),
  http.get(
    "/api/owner/receipt-photos/:photoId",
    withScenario(({ params }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const stored = mockPhotos.load(String(params.photoId));
      return stored
        ? jpeg(stored.bytes)
        : problem(404, "NOT_FOUND", "Foto nota tidak ditemukan");
    }),
  ),
];
