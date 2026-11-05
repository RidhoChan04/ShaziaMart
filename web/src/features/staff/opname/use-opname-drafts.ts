import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import {
  indexedDbOpnameStore,
  type OpnameDraftStore,
} from "./opname-draft-store";
import type { OpnameDraft } from "./opname-draft-types";

/** Penyimpan lain (test); tanpa Provider dipakai IndexedDB HP. */
export const OpnameStoreContext = createContext<OpnameDraftStore | null>(null);

let appStore: OpnameDraftStore | null = null;

/** Satu penyimpan IndexedDB opname per app. */
export function useOpnameStore(): OpnameDraftStore {
  const injected = useContext(OpnameStoreContext);
  if (injected) return injected;
  appStore ??= indexedDbOpnameStore();
  return appStore;
}

// Bukan URL /api/staff/: tidak ikut dibuang saat keluar; draf tetap terpisah per pengguna.
const opnameDraftsKey = (userId: string) =>
  ["staff-opname-drafts", userId] as const;

/** Baca ulang daftar draf opname; bacaan yang sedang berjalan dibatalkan dulu (lihat reloadDrafts). */
export function reloadOpnameDrafts(client: QueryClient, userId: string): void {
  const queryKey = opnameDraftsKey(userId);
  void client
    .cancelQueries({ queryKey })
    .then(() => client.invalidateQueries({ queryKey }));
}

/**
 * Draf opname milik `userId` di HP, urut createdAt. `storageError` = penyimpanan HP gagal
 * dibaca atau simpan/hapus terakhir gagal. `save`/`remove` menolak bila gagal.
 */
export function useOpnameDrafts(userId: string): {
  drafts: OpnameDraft[];
  save: (d: OpnameDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;
  storageError: boolean;
} {
  const store = useOpnameStore();
  const client = useQueryClient();
  const [writeFailed, setWriteFailed] = useState(false);
  const query = useQuery({
    queryKey: opnameDraftsKey(userId),
    queryFn: async () =>
      (await store.list()).filter((d) => d.userId === userId),
    enabled: userId !== "",
  });
  const refresh = () => reloadOpnameDrafts(client, userId);
  const write = async (op: () => Promise<void>) => {
    try {
      await op();
      setWriteFailed(false);
    } catch (error) {
      setWriteFailed(true);
      throw error;
    } finally {
      refresh();
    }
  };
  return {
    drafts: query.data ?? [],
    save: (d) => write(() => store.put(d)),
    remove: (id) => write(() => store.remove(id)),
    refresh,
    storageError: query.isError || writeFailed,
  };
}
