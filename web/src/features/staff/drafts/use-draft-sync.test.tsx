import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { type ReactNode, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { getListStaffReceiptsQueryKey } from "@/shared/api/gen/staff/staff";
import { draft, storeWith } from "./sync-fixtures";
import {
  advance,
  fakeIntervals,
  receiptServer,
  renderSync,
  wrapperFor,
} from "./sync-hook-kit";
import { useDraftSync, useDrafts } from "./use-drafts";

describe("useDraftSync: pemicu kirim", () => {
  test("saat mount (login) mengirim draf antre; setelah terkirim → daftar nota staf & draf dimuat ulang", async () => {
    const api = receiptServer();
    const store = await storeWith(draft("d1"));
    const { client, wrapper } = wrapperFor(store);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => ({ sync: useDraftSync("u-rina"), list: useDrafts("u-rina") }),
      { wrapper },
    );
    await waitFor(() => expect(api.posts).toEqual(["d1"]));
    await waitFor(() => expect(result.current.list.drafts).toEqual([]));
    expect(await store.list()).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getListStaffReceiptsQueryKey(),
    });
    expect(result.current.sync.syncing).toBe(false);
    expect(result.current.sync.storageError).toBe(false);
  });

  test("tanpa pengguna → tidak mengirim; syncNow → laporan kosong", async () => {
    const api = receiptServer();
    const store = await storeWith(draft("d1"));
    const { hook } = renderSync(store, null);
    expect(await hook.result.current.sync.syncNow()).toEqual({
      sent: [],
      rejected: [],
      stopped: null,
    });
    expect(api.posts).toEqual([]);
    expect(await store.get("d1")).toBeDefined();
  });

  test("event 'online' memicu sync (offline → online)", async () => {
    const api = receiptServer();
    api.online = false;
    const store = await storeWith(draft("d1"));
    const { client, hook } = renderSync(store);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(api.posts).toEqual(["d1"]));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    expect((await store.get("d1"))?.status).toBe("queued");
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: getListStaffReceiptsQueryKey(),
    });

    api.online = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(api.posts).toEqual(["d1", "d1"]));
    await waitFor(async () => expect(await store.list()).toEqual([]));
  });

  test("tiap 30 dtk selama ada draf antre (fake timers); berhenti setelah semua terkirim", async () => {
    fakeIntervals();
    const api = receiptServer();
    api.online = false;
    const store = await storeWith(draft("d1"));
    const { hook } = renderSync(store);
    await waitFor(() => expect(api.posts).toHaveLength(1));
    await waitFor(() =>
      expect(hook.result.current.list.drafts.map((d) => d.id)).toEqual(["d1"]),
    );
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));

    await advance(29_000);
    expect(api.posts).toHaveLength(1);
    await advance(1_000);
    await waitFor(() => expect(api.posts).toHaveLength(2));

    api.online = true;
    await advance(30_000);
    await waitFor(() => expect(api.posts).toHaveLength(3));
    await waitFor(() => expect(hook.result.current.list.drafts).toEqual([]));

    await advance(90_000);
    expect(api.posts).toHaveLength(3);
  });

  test("tanpa draf antre (hanya ditolak/sedang diisi) → tidak ada sync berkala", async () => {
    fakeIntervals();
    const api = receiptServer();
    const store = await storeWith(
      draft("d1", { status: "rejected" }),
      draft("d2", { status: "editing" }),
    );
    const { hook } = renderSync(store);
    await waitFor(() =>
      expect(hook.result.current.list.drafts).toHaveLength(2),
    );
    await advance(60_000);
    expect(api.posts).toEqual([]);
  });

  test("server kembali tersambung (cek kesehatan gagal → ok) memicu sync", async () => {
    fakeIntervals();
    let healthy = false;
    server.use(
      http.get("/api/health", () =>
        healthy
          ? HttpResponse.json({ status: "ok", version: "mock", db: "ok" })
          : HttpResponse.error(),
      ),
    );
    const api = receiptServer();
    api.online = false;
    const store = await storeWith(draft("d1"));
    const { hook } = renderSync(store);
    await waitFor(() => expect(api.posts).toHaveLength(1));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));

    healthy = true;
    api.online = true;
    await advance(5_000);
    await waitFor(() => expect(api.posts).toHaveLength(2));
    await waitFor(async () => expect(await store.list()).toEqual([]));
  });

  test("StrictMode (efek dipasang dua kali) → sync saat mount tetap mengirim, tiap draf sekali", async () => {
    const api = receiptServer();
    const store = await storeWith(draft("d1"), draft("d2", { createdAt: 2 }));
    const { wrapper } = wrapperFor(store);
    const strict = ({ children }: { children: ReactNode }) => (
      <StrictMode>{wrapper({ children })}</StrictMode>
    );
    renderHook(() => useDraftSync("u-rina"), { wrapper: strict });
    await waitFor(async () => expect(await store.list()).toEqual([]));
    expect(api.posts).toEqual(["d1", "d2"]);
  });
});
