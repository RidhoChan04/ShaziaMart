import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { post, staffLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { realSyncApi, syncDrafts } from "./sync";
import { photo, storeWith } from "./sync-fixtures";
import {
  INDOMIE,
  indomie2dus,
  RECEIPTS,
  seedLine,
  serverDraft,
  startServerSync,
  switchStaff,
  userIdOf,
} from "./sync-server-kit";

describe("syncDrafts lewat server palsu (realSyncApi): pemilik draf, sesi, dan foto", () => {
  beforeEach(startServerSync);

  test("R7: id draf sudah dipakai Budi → 409 → 'rejected' dengan pesan; draf Rina utuh", async () => {
    await switchStaff("Budi", "654321");
    const budiId = userIdOf("Budi");
    const budiStore = await storeWith(
      serverDraft("draf-1", [indomie2dus()], { userId: budiId }),
    );
    expect((await syncDrafts(budiStore, budiId, realSyncApi)).sent).toEqual([
      "draf-1",
    ]);
    await switchStaff("Rina", "123456");

    const rinaDraft = serverDraft("draf-1", [
      seedLine("l1", INDOMIE, "dus", 3, "110.000"),
    ]);
    const store = await storeWith(rinaDraft);
    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: [],
      rejected: ["draf-1"],
      stopped: null,
    });
    const kept = await store.get("draf-1");
    expect(kept?.status).toBe("rejected");
    expect(kept?.form).toEqual(rinaDraft.form);
    expect(kept?.errors).toEqual([
      { lineId: null, field: "lines", message: "Data ini milik pengguna lain" },
    ]);
  });

  test("401 (sesi habis) → stopped 'unauthorized'; 403 STAFF_LAN_ONLY → stopped 'lan'; draf tetap", async () => {
    const store = await storeWith(serverDraft("draf-1", [indomie2dus()]));
    await post("/api/staff/logout", {});
    expect(
      (await syncDrafts(store, userIdOf("Rina"), realSyncApi)).stopped,
    ).toBe("unauthorized");

    expect((await staffLogin()).status).toBe(200);
    server.use(
      http.post(RECEIPTS, () =>
        problem(403, "STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"),
      ),
    );
    expect(
      (await syncDrafts(store, userIdOf("Rina"), realSyncApi)).stopped,
    ).toBe("lan");
    expect(await store.get("draf-1")).toMatchObject({
      status: "queued",
      errors: [],
    });
    expect(mockDb.get().receipts).toEqual([]);
  });

  test("foto bukan JPEG → 422 dari PUT foto → 'rejected' dengan pesan server; nota tidak dikirim", async () => {
    const store = await storeWith(
      serverDraft("draf-1", [indomie2dus()], {
        photo: photo({ blob: new Blob(["bukan jpeg"]) }),
      }),
    );
    expect(
      (await syncDrafts(store, userIdOf("Rina"), realSyncApi)).rejected,
    ).toEqual(["draf-1"]);
    expect((await store.get("draf-1"))?.errors).toEqual([
      { lineId: null, field: "photoId", message: "Foto nota harus JPEG" },
    ]);
    expect(mockDb.get().receipts).toEqual([]);
  });
});
