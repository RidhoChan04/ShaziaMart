import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { newId } from "@/shared/lib/id";
import { type DraftStore, emptyForm } from "../drafts/draft-store";
import type { ReceiptDraft } from "../drafts/draft-types";
import { useDraftStore, useDrafts } from "../drafts/use-drafts";

const AUTOSAVE_MS = 300;

/** Draf milik pengguna ini; tidak ada, milik orang lain, atau galat baca → undefined (dibuat baru). */
async function loadOwn(
  store: DraftStore,
  userId: string,
  draftId: string | undefined,
): Promise<ReceiptDraft | undefined> {
  if (!draftId) return undefined;
  try {
    const d = await store.get(draftId);
    return d?.userId === userId ? d : undefined;
  } catch {
    return undefined; // banner muncul bila simpan juga gagal
  }
}

function freshDraft(userId: string, today: string): ReceiptDraft {
  const now = Date.now();
  return {
    id: newId(now),
    userId,
    createdAt: now,
    updatedAt: now,
    status: "editing",
    form: emptyForm(today),
    photo: null,
    errors: [],
  };
}

/**
 * Draf yang sedang diisi: dimuat dari HP (atau dibuat baru lalu `?draf=` diisi), setiap
 * perubahan disimpan otomatis 300 ms kemudian. `freeze` menghentikan simpan otomatis
 * (setelah antre/buang) agar draf yang sudah terkirim atau dibuang tidak hidup lagi.
 */
export function useFormDraft(
  userId: string,
  draftId: string | undefined,
  today: string,
) {
  const store = useDraftStore();
  const navigate = useNavigate();
  const drafts = useDrafts(userId);
  const { storageError } = drafts;
  // `save` ikut berubah tiap render; efek dan callback membacanya lewat ref.
  const saveRef = useRef(drafts.save);
  saveRef.current = drafts.save;
  const save = useCallback((d: ReceiptDraft) => saveRef.current(d), []);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const latest = useRef<ReceiptDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frozen = useRef(false);

  const show = useCallback((d: ReceiptDraft) => {
    latest.current = d;
    setDraft(d);
  }, []);

  useEffect(() => {
    const cur = latest.current;
    if (
      userId === "" ||
      (cur && (draftId === undefined || cur.id === draftId))
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const existing = await loadOwn(store, userId, draftId);
      if (cancelled) return;
      if (existing) {
        show(existing);
        return;
      }
      const fresh = freshDraft(userId, today);
      show(fresh);
      try {
        await save(fresh);
      } catch {
        return; // banner HP tidak bisa menyimpan; id baru tetap di layar
      }
      void navigate({
        to: "/staff/masuk/baru",
        search: { draf: fresh.id },
        replace: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, draftId, today, store, save, navigate, show]);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /** Simpan sekarang; menolak bila HP gagal menyimpan. */
  const flush = useCallback(async () => {
    clearTimer();
    const d = latest.current;
    if (d && !frozen.current) await save(d);
  }, [save, clearTimer]);

  const update = useCallback(
    (change: (d: ReceiptDraft) => ReceiptDraft) => {
      const cur = latest.current;
      if (!cur) return;
      show({ ...change(cur), updatedAt: Date.now() });
      if (frozen.current) return;
      clearTimer();
      timer.current = setTimeout(() => {
        flush().catch(() => undefined); // galat tampil lewat storageError
      }, AUTOSAVE_MS);
    },
    [flush, show, clearTimer],
  );

  // Keluar halaman dengan perubahan yang belum tersimpan: simpan dulu.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      if (timer.current) flushRef.current().catch(() => undefined);
    },
    [],
  );

  return {
    draft,
    update,
    flush,
    storageError,
    save,
    /** Ganti isi draf dari penyimpanan (mis. setelah ditolak server) tanpa memicu simpan. */
    replace: show,
    freeze: () => {
      frozen.current = true;
      clearTimer();
    },
    unfreeze: () => {
      frozen.current = false;
    },
  };
}
