import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { getListStaffReceiptsQueryKey } from "@/shared/api/gen/staff/staff";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { type DraftStore, indexedDbDraftStore } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { realSyncApi, type SyncReport, syncDrafts } from "./sync";

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

/** Draf milik `userId` di HP, urut createdAt. */
export function useDrafts(userId: string): {
  drafts: ReceiptDraft[];
  refresh: () => void;
} {
  const store = useDraftStore();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: draftsKey(userId),
    queryFn: async () =>
      (await store.list()).filter((d) => d.userId === userId),
    enabled: userId !== "",
  });
  return {
    drafts: query.data ?? [],
    refresh: () => {
      void client.invalidateQueries({ queryKey: draftsKey(userId) });
    },
  };
}

/**
 * Kirim draf antre: saat login (mount), event `online`, server kembali tersambung, dan tiap
 * 30 dtk selama masih ada draf antre. Pengguna berganti → sync pengguna lama dihentikan.
 */
export function useDraftSync(userId: string | null): {
  syncNow: () => Promise<SyncReport>;
  syncing: boolean;
} {
  const store = useDraftStore();
  const client = useQueryClient();
  const { online, checking } = useServerHealth();
  const { drafts } = useDrafts(userId ?? "");
  const [syncing, setSyncing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const syncNow = useCallback(async (): Promise<SyncReport> => {
    if (userId === null) return NOTHING_SENT;
    const signal = abortRef.current?.signal;
    setSyncing(true);
    try {
      const report = await syncDrafts(store, userId, realSyncApi, { signal });
      if (report.sent.length > 0) {
        void client.invalidateQueries({
          queryKey: getListStaffReceiptsQueryKey(),
        });
      }
      void client.invalidateQueries({ queryKey: draftsKey(userId) });
      return report;
    } finally {
      setSyncing(false);
    }
  }, [client, store, userId]);

  // Pemicu otomatis: gagal tidak apa-apa, draf tetap di HP dan dicoba di pemicu berikutnya.
  const trigger = useEffectEvent(() => {
    syncNow().catch(() => undefined);
  });

  useEffect(() => {
    if (userId === null) return;
    const controller = new AbortController();
    abortRef.current = controller;
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

  return { syncNow, syncing };
}
