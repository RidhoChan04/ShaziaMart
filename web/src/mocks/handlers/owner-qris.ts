import { type HttpHandler, HttpResponse, http } from "msw";
import type {
  QrisDay,
  QrisDayDetail,
  QrisDayList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { isIsoDate, jakartaIsoDate } from "@/shared/lib/business-day";
import { optionalNote } from "../cash/input";
import {
  qrisDayItems,
  qrisDayOf,
  qrisDayTotals,
  qrisMonth,
  unreconciledQrisDays,
} from "../cash/qris-days";
import { type MockQrisDay, mockDb } from "../db";
import { withScenario } from "../scenarios";
import { invalid, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/qris-days";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const NOTE_MAX = 200;

/** QRIS harian pemilik: total per hari, tanda pencocokan, rincian transaksi (S7, S11). */
export const ownerQrisHandlers: HttpHandler[] = [
  http.get(
    BASE,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const params = new URL(request.url).searchParams;
      const now = Date.now();
      const flag = params.get("unreconciled");
      if (flag !== null && flag !== "true" && flag !== "false") {
        return invalid("unreconciled harus true atau false");
      }
      if (flag === "true") {
        const body: QrisDayList = {
          month: null,
          items: unreconciledQrisDays(state, now),
        };
        return HttpResponse.json(body);
      }
      const month = params.get("month") ?? jakartaIsoDate(now).slice(0, 7);
      if (!MONTH.test(month)) return invalid("Bulan tidak valid");
      const body: QrisDayList = { month, items: qrisMonth(state, month, now) };
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    `${BASE}/:date`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const date = String(params.date);
      const now = Date.now();
      if (!isIsoDate(date) || date > jakartaIsoDate(now)) {
        return invalid("Tanggal tidak valid");
      }
      const body: QrisDayDetail = {
        ...qrisDayOf(state, date, now),
        items: qrisDayItems(state, date),
      };
      return HttpResponse.json(body);
    }),
  ),
  http.put(
    `${BASE}/:date`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const date = String(params.date);
      const now = Date.now();
      // Hanya hari yang sudah selesai (sebelum hari ini) yang bisa ditandai.
      if (!isIsoDate(date) || date >= jakartaIsoDate(now)) {
        return invalid("Hanya hari yang sudah selesai yang bisa ditandai");
      }
      const status = body?.status;
      if (status !== "cocok" && status !== "tidak_cocok") {
        return invalid("Pilih Cocok atau Tidak cocok");
      }
      const note = optionalNote(body?.note, NOTE_MAX);
      if (note === undefined) return invalid("Catatan maksimal 200 karakter");
      if (status === "tidak_cocok" && note === null) {
        return invalid("Isi catatan bila tidak cocok");
      }
      // (K21) Total saat ditandai = dasar `changedAfterMark`. Dihitung dari state tersimpan agar
      // draf `update` tidak menyalin & menulis ulang koleksi penjualan.
      const mark: MockQrisDay = {
        date,
        status,
        note,
        markedById: owner.id,
        markedByName: owner.name,
        markedAt: now,
        markedTotal: qrisDayTotals(mockDb.get(), date, now).total,
      };
      // Satu rekaman per tanggal, diganti utuh saat ditandai ulang.
      mockDb.update((s) => {
        s.qrisDays = { ...s.qrisDays, [date]: mark };
      });
      const saved: QrisDay = qrisDayOf(mockDb.get(), date, now);
      return HttpResponse.json(saved);
    }),
  ),
];
