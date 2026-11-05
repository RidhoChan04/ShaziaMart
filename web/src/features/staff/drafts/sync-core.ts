import { ApiError } from "@/shared/api/fetcher";

/** Berhenti sementara: draf tetap antre, dicoba lagi di pemicu berikutnya. */
export type Stop = "offline" | "unauthorized" | "lan";

export type SyncReport = {
  sent: string[];
  rejected: string[];
  stopped: Stop | null;
};

export type SyncOptions = {
  /** Dibatalkan saat pengguna keluar/berganti. */
  signal?: AbortSignal | undefined;
  /** Pengguna sesi saat ini (cache); dicek sebelum tiap request. */
  currentUserId?: (() => string | null) | undefined;
  /**
   * Pengguna sesi dibaca segar dari server di awal tiap putaran (null = tanpa sesi): cache bisa
   * basi bila orang lain masuk dari tab lain, padahal cookie dipakai bersama.
   */
  freshUserId?: (() => Promise<string | null>) | undefined;
};

/** Hasil satu draf: terkirim, ditolak (menunggu dibetulkan), atau berhenti sementara. */
export type Outcome = "sent" | "rejected" | Stop;

/** Gagal sementara (jaringan, server, batas waktu): draf tetap antre, dicoba lagi nanti. */
export function stopFor(error: ApiError): Stop | null {
  if (
    error.code === "NETWORK" ||
    error.status >= 500 ||
    error.status === 408 ||
    error.status === 429
  ) {
    return "offline";
  }
  if (error.code === "UNAUTHORIZED") return "unauthorized";
  if (error.code === "STAFF_LAN_ONLY") return "lan";
  return null;
}

/** Sesi segar bukan pemilik draf → tanpa request sama sekali; tak terbaca → berhenti sementara. */
export async function sessionStop(
  userId: string,
  opts: SyncOptions,
): Promise<Stop | null> {
  if (!opts.freshUserId) return null;
  try {
    return (await opts.freshUserId()) === userId ? null : "unauthorized";
  } catch (error) {
    return (error instanceof ApiError && stopFor(error)) || "offline";
  }
}

/**
 * Boleh mengirim draf milik `userId` sekarang? Tidak bila sync dibatalkan atau sesi (cookie)
 * bukan pemilik draf — mis. Budi sudah masuk sebelum React menghentikan sync Rina.
 */
export function mayRequest(userId: string, opts: SyncOptions): boolean {
  if (opts.signal?.aborted) return false;
  return opts.currentUserId === undefined || opts.currentUserId() === userId;
}

type Queued = { id: string; userId: string; status: string };

/**
 * Kirim draf `queued` milik `userId` satu per satu (urutan `list`) sampai habis atau berhenti.
 * Daftar dibaca ulang tiap draf: draf yang diantre selama sync ikut terkirim.
 */
export async function sendQueued<D extends Queued>(
  list: () => Promise<D[]>,
  userId: string,
  opts: SyncOptions,
  sendOne: (d: D) => Promise<Outcome>,
): Promise<SyncReport> {
  const report: SyncReport = { sent: [], rejected: [], stopped: null };
  const stop = await sessionStop(userId, opts);
  if (stop) return { ...report, stopped: stop };
  const tried = new Set<string>();
  for (;;) {
    if (opts.signal?.aborted) return { ...report, stopped: "unauthorized" };
    const next = (await list()).find(
      (d) => d.userId === userId && d.status === "queued" && !tried.has(d.id),
    );
    if (!next) return report;
    tried.add(next.id);
    const outcome = await sendOne(next);
    if (outcome === "sent") report.sent.push(next.id);
    else if (outcome === "rejected") report.rejected.push(next.id);
    else return { ...report, stopped: outcome };
  }
}

type Flight = {
  userId: string;
  signal: AbortSignal | undefined;
  run: Promise<SyncReport>;
};

const inFlight = new WeakMap<object, Flight>();

/**
 * Single-flight per penyimpan: panggilan bersamaan untuk pengguna yang sama berbagi satu
 * promise; pengguna lain (atau sync yang sudah dibatalkan) menunggu giliran.
 */
export function singleFlight<S extends object>(
  store: S,
  userId: string,
  signal: AbortSignal | undefined,
  run: () => Promise<SyncReport>,
): Promise<SyncReport> {
  const current = inFlight.get(store);
  if (current?.userId === userId && !current.signal?.aborted) {
    return current.run;
  }
  const next = (current?.run.catch(() => undefined) ?? Promise.resolve()).then(
    run,
  );
  const entry: Flight = { userId, signal, run: next };
  inFlight.set(store, entry);
  const clear = () => {
    if (inFlight.get(store) === entry) inFlight.delete(store);
  };
  next.then(clear, clear);
  return next;
}
