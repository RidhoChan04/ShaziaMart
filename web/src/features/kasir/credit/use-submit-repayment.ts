import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import {
  getListShiftCreditPaymentsQueryKey,
  getListShiftCreditPaymentsQueryOptions,
  getSearchCustomersQueryKey,
  useCreateCreditPayment,
} from "@/shared/api/gen/credit/credit";
import type {
  KasirCreditPayment,
  KasirCreditPaymentInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { findRecentDuplicate } from "./duplicate-check";
import { clearPendingRepaymentId } from "./pending-repayment-id";

const REPLAYED_NOTICE =
  "Pelunasan ini sudah tersimpan sebelumnya — cek Riwayat";
const CANCELLED_NOTICE =
  "Pelunasan ini sudah dibatalkan — simpan lagi untuk mencatat yang baru";

const sameRequest = (p: KasirCreditPayment, i: KasirCreditPaymentInput) =>
  p.customerId === i.customerId &&
  p.amount === i.amount &&
  p.method === i.method;

/** Pemberitahuan replay; uang diterima berbeda dari yang diketik → angka tercatat ditulis jelas. */
function replayedNotice(p: KasirCreditPayment, i: KasirCreditPaymentInput) {
  if (p.method !== "tunai" || i.cashReceived === p.cashReceived) {
    return REPLAYED_NOTICE;
  }
  return `${REPLAYED_NOTICE}. Tercatat: uang diterima ${formatRupiah(p.cashReceived)}, kembalian ${formatRupiah(p.change)}.`;
}

/** Pelunasan kembar yang ditemukan, dan permintaan yang ditahan sampai kasir memilih. */
export type DuplicatePrompt = {
  previous: KasirCreditPayment;
  input: KasirCreditPaymentInput;
};

/**
 * Kirim pelunasan kasbon. Satu request sekaligus; `id` milik pemanggil dipakai ulang
 * pada setiap percobaan sehingga kirim ulang (jawaban hilang) tidak mencatat dua kali.
 * Id yang sudah tersimpan dengan isi lain → `notice`, dan yang tampil adalah data server.
 * Replay rekaman yang sudah dibatalkan (200, status dibatalkan) = belum tersimpan: id dilepas,
 * hasil tidak ditampilkan, dan simpan berikutnya memakai id baru.
 *
 * Id baru (K15): daftar pelunasan shift diambil segar dulu; pelunasan kembar 60 menit terakhir →
 * `duplicate` (belum ada request). `confirmDuplicate` mengirim id itu; `dismissDuplicate` tidak
 * mengirim dan melepas id, agar simpan berikutnya diperiksa lagi. Gagal mengambil daftar →
 * langsung kirim (kasir tidak diblokir).
 */
export function useSubmitRepayment(
  onSaved: (payment: KasirCreditPayment) => void,
) {
  const client = useQueryClient();
  const { mutate, isPending } = useCreateCreditPayment({
    // Tingkat hook (bukan per panggilan): tetap jalan walau lembar sudah dilepas (mis. kunci).
    mutation: {
      retry: false,
      onSuccess: () => clearPendingRepaymentId(),
      onError: (err) => {
        if (err instanceof ApiError && err.code === "ID_TAKEN") {
          clearPendingRepaymentId();
        }
      },
    },
  });
  // Penjaga sinkron: klik kedua sebelum render ulang tetap diabaikan.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Pelunasan kembar di daftar shift segar; galat apa pun → null (kirim tanpa peringatan). */
  async function findDuplicate(input: KasirCreditPaymentInput) {
    try {
      const list = await client.fetchQuery({
        ...getListShiftCreditPaymentsQueryOptions(),
        staleTime: 0,
        retry: false,
      });
      return findRecentDuplicate(list, {
        customerId: input.customerId,
        amount: input.amount,
        id: input.id,
        now: Date.now(),
      });
    } catch {
      return null;
    }
  }

  function submit(input: KasirCreditPaymentInput, reusedId: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    if (reusedId) {
      send(input, true);
      return;
    }
    setChecking(true);
    void findDuplicate(input).then((previous) => {
      if (!mounted.current) {
        // Lembar dilepas (kunci, ganti shift) sebelum terkirim: tidak ada yang tersimpan.
        inFlight.current = false;
        clearPendingRepaymentId(input.id);
        return;
      }
      setChecking(false);
      if (previous === null) {
        send(input, false);
        return;
      }
      inFlight.current = false;
      setDuplicate({ previous, input });
    });
  }

  /** `Tetap simpan`: kirim id baru yang tadi ditahan. */
  function confirmDuplicate() {
    if (duplicate === null || inFlight.current) return;
    inFlight.current = true;
    setDuplicate(null);
    send(duplicate.input, false);
  }

  /** `Kembali` / tutup: tidak mengirim; id dilepas agar simpan berikutnya diperiksa lagi. */
  function dismissDuplicate() {
    if (duplicate === null) return;
    clearPendingRepaymentId(duplicate.input.id);
    setDuplicate(null);
  }

  function send(input: KasirCreditPaymentInput, reusedId: boolean) {
    mutate(
      { data: input },
      {
        onSuccess: (payment) => {
          void client.invalidateQueries({
            queryKey: getListShiftCreditPaymentsQueryKey(),
          });
          void client.invalidateQueries({
            queryKey: getSearchCustomersQueryKey(),
          });
          if (payment.status === "dibatalkan") {
            // Id sudah dilepas di onSuccess tingkat hook; uang belum tercatat.
            setError(CANCELLED_NOTICE);
            return;
          }
          if (reusedId || !sameRequest(payment, input))
            setNotice(replayedNotice(payment, input));
          if (payment.printStatus === "gagal") {
            toast.error("Struk gagal dicetak — cetak ulang dari Riwayat");
          }
          onSaved(payment);
        },
        onError: (err) => {
          // Jawaban bisa hilang padahal server sudah menyimpan: segarkan agar tampak di Riwayat.
          void client.invalidateQueries({
            queryKey: getListShiftCreditPaymentsQueryKey(),
          });
          void client.invalidateQueries({
            queryKey: getSearchCustomersQueryKey(),
          });
          setError(pesanError(err));
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return {
    submit,
    pending: isPending || checking,
    error,
    notice,
    duplicate,
    confirmDuplicate,
    dismissDuplicate,
  };
}
