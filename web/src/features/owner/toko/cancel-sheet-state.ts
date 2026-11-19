import type { QueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RELOAD_FAILED, reloadShifts } from "./shifts-cache";

/**
 * Keadaan bersama lembar batal (pengambilan / kas keluar): tanda berhasil untuk fokus, dan galat
 * muat ulang setelah 409. `id` = item yang sedang ditampilkan (null = tertutup); berganti item atau
 * dibuka lagi melepas tanda berhasil dan galat lama, jadi menutup lembar biasa mengembalikan fokus
 * ke baris pemicunya, bukan ke judul halaman.
 */
export function useCancelSheetState(id: string | null, client: QueryClient) {
  const succeeded = useRef(false);
  const shownId = useRef<string | null>(null);
  // Radix hanya mengembalikan fokus ke Trigger; lembar ini dibuka dari baris, jadi pembukanya dicatat.
  const opener = useRef<HTMLElement | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);
  if (id !== shownId.current) {
    shownId.current = id;
    if (id !== null) {
      succeeded.current = false;
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (reloadFailed) setReloadFailed(false);
    }
  }
  /** 409: data dimuat ulang; bila gagal, pesan tampil dan tombol batal disembunyikan. */
  const reloadAfterConflict = () => {
    void reloadShifts(client).then((ok) => {
      if (!ok) {
        setReloadFailed(true);
        toast.error(RELOAD_FAILED);
      }
    });
  };
  /** Berhasil batal: pemicu sudah menjadi baris dibatalkan, fokus ke judul halaman. Selain itu kembali ke baris pembuka. */
  const refocus = (e: Event) => {
    e.preventDefault();
    const target = succeeded.current
      ? document.querySelector<HTMLElement>("main h1")
      : opener.current;
    if (target?.isConnected) target.focus();
  };
  return { succeeded, reloadFailed, reloadAfterConflict, refocus };
}
