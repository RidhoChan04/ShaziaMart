import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { type ReactNode, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import type { Session } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetStaffSessionQueryKey,
  getListStaffReceiptsQueryKey,
} from "@/shared/api/gen/staff/staff";
import { createTestQueryClient } from "@/test/render-app";
import type { DraftStore } from "./draft-store";
import { draft, storeWith } from "./sync-fixtures";
import { DraftStoreContext, useDraftSync, useDrafts } from "./use-drafts";

const RECEIPTS = "/api/staff/receipts";

/** Server nota palsu: `online` false → gagal jaringan; tiap POST dicatat. */
function receiptServer() {
  const state = { online: true, posts: [] as string[] };
  server.use(
    http.post(RECEIPTS, async ({ request }) => {
      const { id } = (await request.json()) as { id: string };
      state.posts.push(id);
      if (!state.online) return HttpResponse.error();
      return HttpResponse.json({ id }, { status: 201 });
    }),
  );
  return state;
}

/** Sesi orang toko di cache (yang dibaca sync sebelum tiap request). */
function signIn(client: QueryClient, userId: string | null) {
  const session: Session | null =
    userId === null
      ? null
      : { user: { id: userId, name: userId, role: "kasir" } };
  client.setQueryData(getGetStaffSessionQueryKey(), session);
}

function wrapperFor(store: DraftStore, userId: string | null = "u-rina") {
  const client = createTestQueryClient();
  signIn(client, userId);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <DraftStoreContext.Provider value={store}>
        {children}
      </DraftStoreContext.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

function renderSync(store: DraftStore, userId: string | null = "u-rina") {
  const { client, wrapper } = wrapperFor(store, userId);
  const hook = renderHook(
    ({ id }: { id: string | null }) => ({
      sync: useDraftSync(id),
      list: useDrafts(id ?? ""),
    }),
    { wrapper, initialProps: { id: userId } },
  );
  return { client, hook };
}

/** Penyimpan yang selalu gagal (mis. IndexedDB diblokir/penuh). */
function brokenStore(): DraftStore {
  const fail = () => Promise.reject(new Error("QuotaExceededError"));
  return { list: fail, get: fail, put: fail, remove: fail, update: fail };
}

/**
 * Hanya setInterval yang dipalsukan (sync berkala, cek kesehatan). Tetap maju seirama jam
 * asli karena waitFor Testing Library juga memakai setInterval untuk memeriksa ulang.
 */
const fakeIntervals = () =>
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval"],
    shouldAdvanceTime: true,
  });

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("useDrafts", () => {
  test("hanya draf pengguna itu, urut createdAt; refresh membaca ulang penyimpan", async () => {
    const store = await storeWith(
      draft("b", { createdAt: 2 }),
      draft("budi", { userId: "u-budi" }),
      draft("a", { createdAt: 1, status: "editing" }),
    );
    const { wrapper } = wrapperFor(store);
    const { result } = renderHook(() => useDrafts("u-rina"), { wrapper });
    await waitFor(() =>
      expect(result.current.drafts.map((d) => d.id)).toEqual(["a", "b"]),
    );
    expect(result.current.storageError).toBe(false);
    await store.put(draft("c", { createdAt: 3 }));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(result.current.drafts.map((d) => d.id)).toEqual(["a", "b", "c"]),
    );
  });

  test("save tepat setelah mount (daftar pertama masih dibaca) → daftar tetap memuat draf baru", async () => {
    const store = await storeWith();
    const { wrapper } = wrapperFor(store);
    const { result } = renderHook(() => useDrafts("u-rina"), { wrapper });
    await act(() => result.current.save(draft("d1", { status: "editing" })));
    await waitFor(() =>
      expect(result.current.drafts.map((d) => d.id)).toEqual(["d1"]),
    );
  });

  test("penyimpan HP gagal → storageError; save menolak keras (form bisa memblokir simpan)", async () => {
    const { wrapper } = wrapperFor(brokenStore());
    const { result } = renderHook(() => useDrafts("u-rina"), { wrapper });
    await waitFor(() => expect(result.current.storageError).toBe(true));
    expect(result.current.drafts).toEqual([]);
    await expect(act(() => result.current.save(draft("d1")))).rejects.toThrow(
      "QuotaExceededError",
    );
  });

  test("save gagal pada penyimpan yang tadinya sehat → storageError menyala", async () => {
    const store = await storeWith();
    store.put = () => Promise.reject(new Error("QuotaExceededError"));
    const { wrapper } = wrapperFor(store);
    const { result } = renderHook(() => useDrafts("u-rina"), { wrapper });
    await waitFor(() => expect(result.current.drafts).toEqual([]));
    expect(result.current.storageError).toBe(false);
    await expect(act(() => result.current.save(draft("d1")))).rejects.toThrow(
      "QuotaExceededError",
    );
    await waitFor(() => expect(result.current.storageError).toBe(true));
  });
});

describe("useDraftSync", () => {
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
