import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { draft, storeWith } from "./sync-fixtures";
import { brokenStore, wrapperFor } from "./sync-hook-kit";
import { useDrafts } from "./use-drafts";

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
