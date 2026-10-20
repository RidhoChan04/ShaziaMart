import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getListTodaySalesQueryKey,
  useCreateSale,
} from "@/shared/api/gen/sales/sales";
import type { PriceChange, Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  creditLimitProblemSchema,
  priceChangedProblemSchema,
  readProblem,
} from "@/shared/api/problem";
import { pesanError } from "@/shared/lib/error-messages";
import { withPriceChanges } from "../cart/cart-helpers";
import { useCart } from "../cart/cart-store";
import { cartSummary } from "../cart/cart-view";
import {
  buildSaleRequest,
  type PaymentChoice,
  saleMatchesRequest,
} from "./payment-model";

export type SubmitPrompt =
  | { kind: "none" }
  | {
      kind: "priceChanged";
      changes: PriceChange[];
      oldTotal: number;
      newTotal: number;
    }
  | { kind: "ownerPin"; error: string | null }
  | { kind: "replayed"; sale: Sale };

export type SaleSubmission = ReturnType<typeof useSubmitSale>;

type Attempt = { choice: PaymentChoice; print: boolean; ownerPin?: string };

const NONE: SubmitPrompt = { kind: "none" };
const TOTAL_CHANGED = "Total berubah — periksa pembayaran";

/**
 * Kirim penjualan dari keranjang. Satu request sekaligus; `saleId` keranjang dipakai
 * ulang pada setiap percobaan sehingga retry tidak pernah membuat dua penjualan.
 * 409 PRICE_CHANGED / CREDIT_LIMIT membuka prompt; error lain jadi pesan di jendela bayar.
 */
export function useSubmitSale(onPaid: (sale: Sale) => void) {
  const client = useQueryClient();
  const { mutate, isPending } = useCreateSale({ mutation: { retry: false } });
  // Penjaga sinkron: klik kedua sebelum render ulang tetap diabaikan.
  const inFlight = useRef(false);
  const last = useRef<Attempt | null>(null);
  const [prompt, setPrompt] = useState<SubmitPrompt>(NONE);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function fail(err: unknown, attempt: Attempt) {
    const priceChanged = readProblem(err, priceChangedProblemSchema);
    if (priceChanged) {
      const { changes } = priceChanged;
      const { lines } = useCart.getState();
      setPrompt({
        kind: "priceChanged",
        changes,
        oldTotal: cartSummary(lines).total,
        newTotal: cartSummary(withPriceChanges(lines, changes)).total,
      });
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

  /** Penjualan tersimpan: keranjang selesai dengan kembalian dari server. */
  function finish(sale: Sale) {
    setPrompt(NONE);
    void client.invalidateQueries({ queryKey: getListTodaySalesQueryKey() });
    useCart.getState().completeSale(sale.change);
    if (sale.printStatus === "gagal") {
      toast.error("Struk gagal dicetak — cetak ulang dari Riwayat");
    }
    onPaid(sale);
  }

  function send(attempt: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    last.current = attempt;
    setError(null);
    setNotice(null);
    if (attempt.ownerPin !== undefined)
      setPrompt({ kind: "ownerPin", error: null });
    try {
      const body = buildSaleRequest(
        useCart.getState(),
        attempt.choice,
        attempt.print,
        attempt.ownerPin,
      );
      mutate(
        { data: body },
        {
          // saleId yang sama dengan isi lain (jawaban sebelumnya hilang): yang tersimpan yang benar.
          onSuccess: (sale) =>
            saleMatchesRequest(sale, body)
              ? finish(sale)
              : setPrompt({ kind: "replayed", sale }),
          onError: (err) => fail(err, attempt),
          onSettled: () => {
            inFlight.current = false;
          },
        },
      );
    } catch (err) {
      inFlight.current = false;
      fail(err, attempt);
    }
  }

  return {
    prompt,
    error,
    /** Keterangan non-error di jendela bayar, mis. total berubah. */
    notice,
    pending: isPending,
    submit: (choice: PaymentChoice, print: boolean) => send({ choice, print }),
    /**
     * Terapkan harga baru. Hanya tunai yang uangnya masih menutup total baru dikirim
     * ulang otomatis (`rechoose` menilai ulang isian); QRIS, kasbon, dan campuran
     * kembali ke jendela bayar agar kasir memeriksa pembayaran dengan total baru.
     */
    confirmPrices(rechoose: () => PaymentChoice | null) {
      if (prompt.kind !== "priceChanged" || !last.current) return;
      useCart.getState().applyPriceChanges(prompt.changes);
      const choice = last.current.choice.kind === "tunai" ? rechoose() : null;
      if (choice) {
        send({ ...last.current, choice });
        return;
      }
      setPrompt(NONE);
      setNotice(TOTAL_CHANGED);
    },
    confirmPin(pin: string) {
      if (last.current) send({ ...last.current, ownerPin: pin });
    },
    /** Penjualan lama (replay saleId) diakui kasir: selesaikan keranjang dengan data server. */
    acceptReplayed() {
      if (prompt.kind === "replayed") finish(prompt.sale);
    },
    dismissPrompt() {
      if (!inFlight.current) setPrompt(NONE);
    },
  };
}
