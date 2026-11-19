import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import type {
  DrawerExpense,
  ExpenseInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getListShiftExpensesQueryKey,
  useCreateShiftExpense,
} from "@/shared/api/gen/shift/shift";
import { pesanError } from "@/shared/lib/error-messages";
import { clearPendingExpenseId } from "./pending-expense-id";

const REPLAYED_NOTICE = "Kas keluar ini sudah tercatat sebelumnya";
const CANCELLED_NOTICE =
  "Kas keluar ini sudah dibatalkan — catat lagi untuk mencatat yang baru";

const sameRequest = (e: DrawerExpense, i: ExpenseInput) =>
  e.amount === i.amount && e.reason === i.reason;

/**
 * Kirim kas keluar. Satu request sekaligus; `id` milik pemanggil dipakai ulang pada setiap
 * percobaan sehingga kirim ulang (jawaban hilang) tidak mencatat dua kali. Replay (id dipakai
 * ulang atau isi server berbeda) → toast replay. Replay rekaman yang sudah dibatalkan = belum
 * tercatat: id dilepas dan hasilnya tidak dianggap tersimpan.
 */
export function useSubmitExpense(onSaved: () => void) {
  const client = useQueryClient();
  const { mutate, isPending } = useCreateShiftExpense({
    mutation: {
      retry: false,
      onSuccess: () => clearPendingExpenseId(),
      onError: (err) => {
        if (err instanceof ApiError && err.code === "ID_TAKEN") {
          clearPendingExpenseId();
        }
      },
    },
  });
  // Penjaga sinkron: klik kedua sebelum render ulang tetap diabaikan.
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    void client.invalidateQueries({ queryKey: getListShiftExpensesQueryKey() });

  function submit(input: ExpenseInput, reusedId: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    mutate(
      { data: input },
      {
        onSuccess: (expense) => {
          refresh();
          if (expense.status === "dibatalkan") {
            setError(CANCELLED_NOTICE);
            return;
          }
          if (reusedId || !sameRequest(expense, input)) {
            toast.warning(REPLAYED_NOTICE);
          } else {
            toast.success("Kas keluar tercatat");
          }
          onSaved();
        },
        onError: (err) => {
          // Jawaban bisa hilang padahal server sudah menyimpan: segarkan agar tampak di Riwayat.
          refresh();
          setError(pesanError(err));
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return { submit, pending: isPending, error };
}
