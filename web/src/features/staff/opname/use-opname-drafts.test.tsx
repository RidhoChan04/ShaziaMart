import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import {
  getListStaffOpnameCategoriesQueryKey,
  getListStaffOpnameSessionsQueryKey,
} from "@/shared/api/gen/staff/staff";
import { draft, storeWith } from "../drafts/sync-fixtures";
import {
  advance,
  brokenStore,
  fakeIntervals,
  opnameServer,
  receiptServer,
  renderSync,
  signIn,
  wrapperFor,
} from "../drafts/sync-hook-kit";
import type { OpnameDraft } from "./opname-draft-types";
import { opnameDraft, opnameStoreWith } from "./opname-fixtures";
import { useOpnameDrafts } from "./use-opname-drafts";

const ids = (drafts: OpnameDraft[]) => drafts.map((d) => d.id);

/** Urutan POST yang masuk ke server palsu (path). */
function capturePostPaths() {
  const paths: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST") paths.push(new URL(request.url).pathname);
  });
  return paths;
}

afterEach(() => {
  server.events.removeAllListeners();
});

describe("useOpnameDrafts", () => {
  test("hanya draf pengguna itu, urut createdAt; save & remove memuat ulang daftar", async () => {
    const opname = await opnameStoreWith(
      opnameDraft("b", { createdAt: 2 }),
      opnameDraft("budi", { userId: "u-budi" }),
      opnameDraft("a", { createdAt: 1, status: "counting" }),
    );
    const { wrapper } = wrapperFor(await storeWith(), "u-rina", opname);
    const { result } = renderHook(() => useOpnameDrafts("u-rina"), {
      wrapper,
    });
    await waitFor(() => expect(ids(result.current.drafts)).toEqual(["a", "b"]));
    expect(result.current.storageError).toBe(false);

    await act(() => result.current.save(opnameDraft("c", { createdAt: 3 })));
    await waitFor(() =>
      expect(ids(result.current.drafts)).toEqual(["a", "b", "c"]),
    );
    await act(() => result.current.remove("a"));
    await waitFor(() => expect(ids(result.current.drafts)).toEqual(["b", "c"]));
    expect(ids(await opname.list())).toEqual(["budi", "b", "c"]);

    await opname.put(opnameDraft("d", { createdAt: 4 }));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(ids(result.current.drafts)).toEqual(["b", "c", "d"]),
    );
  });

  test("penyimpan HP gagal → storageError; save & remove menolak keras", async () => {
    const { wrapper } = wrapperFor(await storeWith(), "u-rina", brokenStore());
    const { result } = renderHook(() => useOpnameDrafts("u-rina"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.storageError).toBe(true));
    expect(result.current.drafts).toEqual([]);
    await expect(
      act(() => result.current.save(opnameDraft("d1"))),
    ).rejects.toThrow("QuotaExceededError");
    await expect(act(() => result.current.remove("d1"))).rejects.toThrow(
      "QuotaExceededError",
    );
  });
});

describe("useDraftSync: draf opname ikut mesin sinkron yang sama", () => {
  test("satu putaran mengirim nota lalu opname; laporan digabung; daftar sesi opname dimuat ulang", async () => {
    const receipts = receiptServer();
    const opnames = opnameServer();
    const paths = capturePostPaths();
    const store = await storeWith(draft("r1"));
    const opname = await opnameStoreWith(opnameDraft("o1"));
    const { client, hook } = renderSync(store, "u-rina", opname);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(opnames.posts).toEqual(["o1"]));
    expect(receipts.posts).toEqual(["r1"]);
    expect(paths).toEqual([
      "/api/staff/receipts",
      "/api/staff/opname-sessions",
    ]);
    await waitFor(() => expect(hook.result.current.opname.drafts).toEqual([]));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getListStaffOpnameSessionsQueryKey(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getListStaffOpnameCategoriesQueryKey(),
    });

    await store.put(draft("r2"));
    await opname.put(opnameDraft("o2"));
    expect(await act(() => hook.result.current.sync.syncNow())).toEqual({
      sent: ["r2", "o2"],
      rejected: [],
      stopped: null,
    });
    expect(await opname.list()).toEqual([]);
  });

  test("nota berhenti (offline) → opname tidak dicoba di putaran itu; draf tetap antre", async () => {
    const receipts = receiptServer();
    receipts.online = false;
    const opnames = opnameServer();
    const store = await storeWith(draft("r1"));
    const opname = await opnameStoreWith(opnameDraft("o1"));
    const { hook } = renderSync(store, "u-rina", opname);
    await waitFor(() => expect(receipts.posts).toEqual(["r1"]));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    expect(opnames.posts).toEqual([]);
    expect((await opname.get("o1"))?.status).toBe("queued");
  });

  test("interval kirim ulang aktif bila hanya ada draf opname queued", async () => {
    fakeIntervals();
    const opnames = opnameServer();
    opnames.online = false;
    const opname = await opnameStoreWith(opnameDraft("o1"));
    const { hook } = renderSync(await storeWith(), "u-rina", opname);
    await waitFor(() => expect(opnames.posts).toHaveLength(1));
    await waitFor(() =>
      expect(ids(hook.result.current.opname.drafts)).toEqual(["o1"]),
    );
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));

    await advance(29_000);
    expect(opnames.posts).toHaveLength(1);
    await advance(1_000);
    await waitFor(() => expect(opnames.posts).toHaveLength(2));

    opnames.online = true;
    await advance(30_000);
    await waitFor(() => expect(hook.result.current.opname.drafts).toEqual([]));
    await advance(90_000);
    expect(opnames.posts).toHaveLength(3);
  });

  test("tanpa draf opname antre (sedang dihitung/ditolak) → tidak ada sync berkala", async () => {
    fakeIntervals();
    const opnames = opnameServer();
    const opname = await opnameStoreWith(
      opnameDraft("o1", { status: "counting" }),
      opnameDraft("o2", { status: "rejected" }),
    );
    const { hook } = renderSync(await storeWith(), "u-rina", opname);
    await waitFor(() =>
      expect(hook.result.current.opname.drafts).toHaveLength(2),
    );
    await advance(60_000);
    expect(opnames.posts).toEqual([]);
  });

  test("Rina keluar, Budi masuk → draf opname Rina tidak dikirim; Rina masuk lagi → terkirim", async () => {
    const opnames = opnameServer();
    const opname = await opnameStoreWith(
      opnameDraft("rina"),
      opnameDraft("budi", { userId: "u-budi" }),
    );
    const { client, hook } = renderSync(await storeWith(), null, opname);
    signIn(client, "u-budi");
    hook.rerender({ id: "u-budi" });
    await waitFor(() => expect(opnames.posts).toEqual(["budi"]));
    await waitFor(() => expect(hook.result.current.sync.syncing).toBe(false));
    expect(ids(await opname.list())).toEqual(["rina"]);

    signIn(client, null);
    hook.rerender({ id: null });
    signIn(client, "u-rina");
    hook.rerender({ id: "u-rina" });
    await waitFor(() => expect(opnames.posts).toEqual(["budi", "rina"]));
    await waitFor(async () => expect(await opname.list()).toEqual([]));
  });

  test("penyimpan opname gagal → storageError sync (tidak ditelan), nota tetap terkirim", async () => {
    const receipts = receiptServer();
    const { hook } = renderSync(
      await storeWith(draft("r1")),
      "u-rina",
      brokenStore(),
    );
    await waitFor(() =>
      expect(hook.result.current.sync.storageError).toBe(true),
    );
    expect(hook.result.current.opname.storageError).toBe(true);
    await waitFor(() => expect(receipts.posts).toEqual(["r1"]));
  });
});
