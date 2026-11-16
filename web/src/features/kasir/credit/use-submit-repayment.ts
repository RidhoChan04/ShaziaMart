import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import {
  getListShiftCreditPaymentsQueryKey,
  getSearchCustomersQueryKey,
  useCreateCreditPayment,
} from "@/shared/api/gen/credit/credit";
import type {
  KasirCreditPayment,
  KasirCreditPaymentInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { clearPendingRepaymentId } from "./pending-repayment-id";

const REPLAYED_NOTICE =
  "Pelunasan ini sudah tersimpan sebelumnya — cek Riwayat";

const sameRequest = (p: KasirCreditPayment, i: KasirCreditPaymentInput) =>
  p.customerId === i.customerId &&
  p.amount === i.amount &&
  p.method === i.method;

/**
 * Kirim pelunasan kasbon. Satu request sekaligus; `id` milik pemanggil dipakai ulang
 * pada setiap percobaan sehingga kirim ulang (jawaban hilang) tidak mencatat dua kali.
 * Id yang sudah tersimpan dengan isi lain → `notice`, dan yang tampil adalah data server.
 */
export function useSubmitRepayment(
  onSaved: (payment: KasirCreditPayment) => void,
) {
  const client = useQueryClient();
  const { mutate, isPending } = useCreateCreditPayment({
    // Tingkat hook (bukan per panggilan): tetap jalan walau lembar sudah dilepas (mis. kunci).
    mutation: {
      retry: false,
      onSuccess: clearPendingRepaymentId,
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

  function submit(input: KasirCreditPaymentInput, reusedId: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);
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
          if (reusedId || !sameRequest(payment, input))
            setNotice(REPLAYED_NOTICE);
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

  return { submit, pending: isPending, error, notice };
}
