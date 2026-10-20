import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCreateSale } from "@/shared/api/gen/sales/sales";
import type { PriceChange, Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  creditLimitProblemSchema,
  priceChangedProblemSchema,
  readProblem,
} from "@/shared/api/problem";
import { pesanError } from "@/shared/lib/error-messages";
import { useCart } from "../cart/cart-store";
import { buildSaleRequest, type PaymentChoice } from "./payment-model";

export type SubmitPrompt =
  | { kind: "none" }
  | { kind: "priceChanged"; changes: PriceChange[] }
  | { kind: "ownerPin"; error: string | null };

type Attempt = { choice: PaymentChoice; print: boolean; ownerPin?: string };

const NONE: SubmitPrompt = { kind: "none" };

/**
 * Kirim penjualan dari keranjang. Satu request sekaligus; `saleId` keranjang dipakai
 * ulang pada setiap percobaan sehingga retry tidak pernah membuat dua penjualan.
 * 409 PRICE_CHANGED / CREDIT_LIMIT membuka prompt; error lain jadi pesan di jendela bayar.
 */
export function useSubmitSale(onPaid: (sale: Sale) => void) {
  const { mutate, isPending } = useCreateSale({ mutation: { retry: false } });
  // Penjaga sinkron: klik kedua sebelum render ulang tetap diabaikan.
  const inFlight = useRef(false);
  const last = useRef<Attempt | null>(null);
  const [prompt, setPrompt] = useState<SubmitPrompt>(NONE);
  const [error, setError] = useState<string | null>(null);

  function fail(err: unknown, attempt: Attempt) {
    const priceChanged = readProblem(err, priceChangedProblemSchema);
    if (priceChanged) {
      setPrompt({ kind: "priceChanged", changes: priceChanged.changes });
      return;
    }
    if (readProblem(err, creditLimitProblemSchema)) {
      setPrompt({ kind: "ownerPin", error: null });
      return;
    }
    if (attempt.ownerPin !== undefined) {
      // Gagal setelah PIN dimasukkan: pesan tampil di dialog PIN yang masih terbuka.
      setPrompt({ kind: "ownerPin", error: pesanError(err) });
      return;
    }
    setPrompt(NONE);
    setError(pesanError(err));
  }

  function send(attempt: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    last.current = attempt;
    setError(null);
    if (attempt.ownerPin !== undefined)
      setPrompt({ kind: "ownerPin", error: null });
    const body = buildSaleRequest(
      useCart.getState(),
      attempt.choice,
      attempt.print,
      attempt.ownerPin,
    );
    mutate(
      { data: body },
      {
        onSuccess: (sale) => {
          setPrompt(NONE);
          useCart.getState().completeSale(sale.change);
          if (sale.printStatus === "gagal") {
            toast.error("Struk gagal dicetak — cetak ulang dari Riwayat");
          }
          onPaid(sale);
        },
        onError: (err) => fail(err, attempt),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return {
    prompt,
    error,
    pending: isPending,
    submit: (choice: PaymentChoice, print: boolean) => send({ choice, print }),
    /** Terapkan harga baru lalu kirim ulang; `rechoose` menilai ulang isian terhadap total baru. */
    confirmPrices(rechoose: () => PaymentChoice | null) {
      if (prompt.kind !== "priceChanged" || !last.current) return;
      useCart.getState().applyPriceChanges(prompt.changes);
      const choice = rechoose();
      if (choice) send({ ...last.current, choice });
      else setPrompt(NONE);
    },
    confirmPin(pin: string) {
      if (last.current) send({ ...last.current, ownerPin: pin });
    },
    dismissPrompt() {
      if (!inFlight.current) setPrompt(NONE);
    },
  };
}
