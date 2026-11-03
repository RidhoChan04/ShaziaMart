import { act, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { getGetStaffSessionQueryKey } from "@/shared/api/gen/staff/staff";
import { draft, storeWith } from "./sync-fixtures";
import {
  brokenStore,
  receiptServer,
  renderSync,
  serveSession,
  signIn,
} from "./sync-hook-kit";

describe("useDraftSync: pengguna dan penyimpan", () => {
  test("ganti pengguna: draf Budi terkirim, draf Rina tetap di HP", async () => {
    const api = receiptServer();
    const store = await storeWith(
      draft("rina"),
      draft("budi", { userId: "u-budi" }),
    );
    const { client, hook } = renderSync(store, null);
    signIn(client, "u-budi");
    hook.rerender({ id: "u-budi" });
    await waitFor(() => expect(api.posts).toEqual(["budi"]));
    await waitFor(async () =>
      expect((await store.list()).map((d) => d.id)).toEqual(["rina"]),
    );
  });

  test("Budi sudah masuk tapi React belum berganti pengguna: event 'online' untuk Rina tidak mengirim apa pun atas nama Budi", async () => {
    const api = receiptServer();
    api.online = false;
    const store = await storeWith(draft("rina"));
    const { client, hook } = renderSync(store, "u-rina");
    await waitFor(() => expect(api.posts).toEqual(["rina"]));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));

    api.online = true;
    signIn(client, "u-budi"); // cookie & cache sudah Budi, hook masih Rina
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    const report = await act(() => hook.result.current.sync.syncNow());
    expect(report.sent).toEqual([]);
    expect(api.posts).toEqual(["rina"]);
    expect(await store.get("rina")).toEqual(draft("rina"));
  });

  test("syncNow lama (closure pengguna sebelumnya) setelah berganti pengguna → tidak mengirim", async () => {
    const api = receiptServer();
    api.online = false;
    const store = await storeWith(draft("rina"));
    const { client, hook } = renderSync(store, "u-rina");
    await waitFor(() => expect(api.posts).toEqual(["rina"]));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    const staleSyncNow = hook.result.current.sync.syncNow;

    api.online = true;
    signIn(client, "u-budi");
    hook.rerender({ id: "u-budi" });
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    const list = vi.spyOn(store, "list");
    expect(await act(() => staleSyncNow())).toEqual({
      sent: [],
      rejected: [],
      stopped: null,
    });
    // Tidak memakai pengendali milik Budi: sync Rina tidak dimulai sama sekali.
    expect(list).not.toHaveBeenCalled();
    expect(api.posts).toEqual(["rina"]);
    expect((await store.get("rina"))?.status).toBe("queued");
  });

  test("penyimpan HP gagal → storageError (tidak ditelan diam-diam), tanpa request", async () => {
    const api = receiptServer();
    const { hook } = renderSync(brokenStore());
    await waitFor(() =>
      expect(hook.result.current.sync.storageError).toBe(true),
    );
    expect(hook.result.current.list.storageError).toBe(true);
    expect(api.posts).toEqual([]);
  });

  test("tab lain: Budi masuk di tab lain (cookie Budi), cache tab ini masih Rina → tidak ada yang dikirim; sesi dimuat ulang", async () => {
    const api = receiptServer();
    const store = await storeWith(draft("rina"));
    const { client, hook } = renderSync(store, null);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    signIn(client, "u-rina");
    serveSession("u-budi");
    hook.rerender({ id: "u-rina" });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getGetStaffSessionQueryKey(),
      }),
    );
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    expect(await act(() => hook.result.current.sync.syncNow())).toMatchObject({
      sent: [],
      stopped: "unauthorized",
    });
    expect(api.posts).toEqual([]);
    expect(await store.get("rina")).toEqual(draft("rina"));
  });
});
