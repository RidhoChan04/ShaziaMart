import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { ApiError } from "@/shared/api/fetcher";
import type { Session } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetStaffSessionQueryKey,
  getListStaffReceiptsQueryKey,
  getStaffSession,
} from "@/shared/api/gen/staff/staff";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { type DraftStore, indexedDbDraftStore } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { realSyncApi, syncDrafts } from "./sync";
import type { SyncReport } from "./sync-core";

const SYNC_INTERVAL_MS = 30_000;
const NOTHING_SENT: SyncReport = { sent: [], rejected: [], stopped: null };

/** Penyimpan lain (test); tanpa Provider dipakai IndexedDB HP. */
export const DraftStoreContext = createContext<DraftStore | null>(null);

let appStore: DraftStore | null = null;

/** Satu penyimpan IndexedDB per app. */
export function useDraftStore(): DraftStore {
  const injected = useContext(DraftStoreContext);
  if (injected) return injected;
  appStore ??= indexedDbDraftStore();
  return appStore;
}

// Bukan URL /api/staff/: tidak ikut dibuang saat keluar; draf tetap terpisah per pengguna.
const draftsKey = (userId: string) => ["staff-drafts", userId] as const;

/**
 * Baca ulang daftar draf. Bacaan yang sedang berjalan dibatalkan dulu: tanpa itu TanStack
 * memakai bacaan lama (sebelum simpan) bila daftar belum pernah selesai dimuat.
 */
function reloadDrafts(client: QueryClient, userId: string): void {
  const queryKey = draftsKey(userId);
  void client
    .cancelQueries({ queryKey })
    .then(() => client.invalidateQueries({ queryKey }));
}

/**
 * Draf milik `userId` di HP, urut createdAt. `storageError` = penyimpanan HP gagal dibaca
 * atau simpan terakhir gagal (tampilkan peringatan). `save` menolak bila gagal menyimpan.
 */
export function useDrafts(userId: string): {
  drafts: ReceiptDraft[];
  refresh: () => void;
  storageError: boolean;
  save: (d: ReceiptDraft) => Promise<void>;
} {
  const store = useDraftStore();
  const client = useQueryClient();
  const [saveFailed, setSaveFailed] = useState(false);
  const query = useQuery({
    queryKey: draftsKey(userId),
    queryFn: async () =>
      (await store.list()).filter((d) => d.userId === userId),
    enabled: userId !== "",
  });
  const refresh = () => reloadDrafts(client, userId);
  return {
    drafts: query.data ?? [],
    refresh,
    storageError: query.isError || saveFailed,
    save: async (d) => {
      try {
        await store.put(d);
        setSaveFailed(false);
      } catch (error) {
        setSaveFailed(true);
        throw error;
      } finally {
        refresh();
      }
    },
  };
}

/** Pengguna sesi orang toko di cache (diperbarui saat masuk/keluar). */
const sessionUserId = (client: QueryClient) => () =>
  client.getQueryData<Session | null>(getGetStaffSessionQueryKey())?.user.id ??
  null;

/**
 * Sesi dibaca segar dari server di awal tiap putaran sync. Beda dengan cache (orang lain masuk
 * dari tab lain) → sesi dimuat ulang lewat query gerbang; 401 tidak menyentuh sesi (R26).
 */
const freshSessionUserId = (client: QueryClient) => async () => {
  const fresh = await getStaffSession().then(
    (s) => s.user.id,
    (error: unknown) => {
      if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
        return null;
      }
      throw error;
    },
  );
  if (fresh !== null && fresh !== sessionUserId(client)()) {
    void client.invalidateQueries({ queryKey: getGetStaffSessionQueryKey() });
  }
  return fresh;
};

/**
 * Kirim draf antre: saat login (mount), event `online`, server kembali tersambung, dan tiap
 * 30 dtk selama masih ada draf antre. Pengguna berganti → sync pengguna lama dihentikan.
 * `storageError` = penyimpanan HP gagal (sync tidak bisa jalan); tampilkan peringatan.
 */
export function useDraftSync(userId: string | null): {
  syncNow: () => Promise<SyncReport>;
  syncing: boolean;
  storageError: boolean;
} {
  const store = useDraftStore();
  const client = useQueryClient();
  const { online, checking } = useServerHealth();
  const { drafts, storageError: listFailed } = useDrafts(userId ?? "");
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  // Pengendali milik satu pengguna; syncNow lama (pengguna lain) tidak memakainya.
  const owner = useRef<{ userId: string; controller: AbortController } | null>(
    null,
  );

  const syncNow = useCallback(async (): Promise<SyncReport> => {
    const own = owner.current;
    if (
      userId === null ||
      own?.userId !== userId ||
      own.controller.signal.aborted
    ) {
      return NOTHING_SENT;
    }
    setSyncing(true);
    try {
      const report = await syncDrafts(store, userId, realSyncApi, {
        signal: own.controller.signal,
        currentUserId: sessionUserId(client),
        freshUserId: freshSessionUserId(client),
      });
      setSyncFailed(false);
      if (report.sent.length > 0) {
        void client.invalidateQueries({
          queryKey: getListStaffReceiptsQueryKey(),
        });
      }
      return report;
    } catch (error) {
      setSyncFailed(true);
      throw error;
    } finally {
      reloadDrafts(client, userId);
      setSyncing(false);
    }
  }, [client, store, userId]);

  // Pemicu otomatis: galat sudah tampil lewat storageError; dicoba lagi di pemicu berikutnya.
  const trigger = useEffectEvent(() => {
    syncNow().catch(() => undefined);
  });

  useEffect(() => {
    if (userId === null) return;
    const controller = new AbortController();
    owner.current = { userId, controller };
    trigger();
    // Keluar/berganti pengguna: sync pengguna ini berhenti sebelum request berikutnya.
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    const onOnline = () => trigger();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const wasOnline = useRef<boolean | null>(null);
  useEffect(() => {
    if (checking) return;
    if (wasOnline.current === false && online) trigger();
    wasOnline.current = online;
  }, [online, checking]);

  const hasQueued = drafts.some((d) => d.status === "queued");
  useEffect(() => {
    if (!hasQueued) return;
    const timer = setInterval(() => trigger(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasQueued]);

  return { syncNow, syncing, storageError: listFailed || syncFailed };
}
