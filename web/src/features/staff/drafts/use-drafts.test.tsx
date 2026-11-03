import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { type ReactNode, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import { getListStaffReceiptsQueryKey } from "@/shared/api/gen/staff/staff";
import { createTestQueryClient } from "@/test/render-app";
import { type DraftStore, emptyForm, memoryDraftStore } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { DraftStoreContext, useDraftSync, useDrafts } from "./use-drafts";

const RECEIPTS = "/api/staff/receipts";

function draft(id: string, patch: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    id,
    userId: "u-rina",
    createdAt: 1,
    updatedAt: 1,
    status: "queued",
    form: {
      ...emptyForm("2026-11-02"),
      supplierName: "CV Sumber Rejeki",
      lines: [
        {
          lineId: "l1",
          product: {
            id: "p-indomie",
            name: "Indomie Goreng",
            category: null,
            baseUnit: "pcs",
            units: [{ id: "u-dus", name: "dus", unitSize: 40, barcodes: [] }],
          },
          unitId: "u-dus",
          newProduct: null,
          qty: 2,
          unitCostText: "112.000",
          expiryDate: null,
        },
      ],
    },
    photo: null,
    errors: [],
    ...patch,
  };
}

async function storeWith(...drafts: ReceiptDraft[]): Promise<DraftStore> {
  const store = memoryDraftStore();
  for (const d of drafts) await store.put(d);
  return store;
}

/** Server nota palsu: `online` false â†’ gagal jaringan; tiap POST dicatat. */
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

function wrapperFor(store: DraftStore) {
  const client = createTestQueryClient();
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
  const { client, wrapper } = wrapperFor(store);
  const hook = renderHook(
    ({ id }: { id: string | null }) => ({
      sync: useDraftSync(id),
      list: useDrafts(id ?? ""),
    }),
    { wrapper, initialProps: { id: userId } },
  );
  return { client, hook };
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
    await store.put(draft("c", { createdAt: 3 }));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(result.current.drafts.map((d) => d.id)).toEqual(["a", "b", "c"]),
    );
  });
});

describe("useDraftSync", () => {
  test("saat mount (login) mengirim draf antre; setelah terkirim â†’ daftar nota staf & draf dimuat ulang", async () => {
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
  });

  test("tanpa pengguna â†’ tidak mengirim; syncNow â†’ laporan kosong", async () => {
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

  test("event 'online' memicu sync (offline â†’ online)", async () => {
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

  test("tanpa draf antre (hanya ditolak/sedang diisi) â†’ tidak ada sync berkala", async () => {
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

  test("server kembali tersambung (cek kesehatan gagal â†’ ok) memicu sync", async () => {
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
    const { hook } = renderSync(store, null);
    hook.rerender({ id: "u-budi" });
    await waitFor(() => expect(api.posts).toEqual(["budi"]));
    await waitFor(async () =>
      expect((await store.list()).map((d) => d.id)).toEqual(["rina"]),
    );
  });

  test("StrictMode (efek dipasang dua kali) â†’ sync saat mount tetap mengirim, tiap draf sekali", async () => {
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
