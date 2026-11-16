import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
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

const REPLAYED_NOTICE = "Pelunasan ini sudah tersimpan sebelumnya";

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
    mutation: { retry: false },
  });
  // Penjaga sinkron: klik kedua sebelum render ulang tetap diabaikan.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit(input: KasirCreditPaymentInput) {
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
          if (!sameRequest(payment, input)) setNotice(REPLAYED_NOTICE);
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
