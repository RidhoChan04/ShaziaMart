import type { CartLine } from "../cart/cart-store";
import { OwnerPinDialog } from "../shared/owner-pin-dialog";
import type { PaymentChoice } from "./payment-model";
import { PriceChangedDialog } from "./price-changed-dialog";
import { ReplayedSaleDialog } from "./replayed-sale-dialog";
import type { SaleSubmission } from "./use-submit-sale";

/** Jendela lanjutan saat menyimpan: harga berubah, PIN pemilik, transaksi sudah tersimpan. */
export function SalePrompts({
  sale,
  lines,
  rechoose,
}: {
  sale: SaleSubmission;
  lines: readonly CartLine[];
  /** Pilihan pembayaran dinilai ulang terhadap total keranjang terkini. */
  rechoose: () => PaymentChoice | null;
}) {
  const { prompt } = sale;
  return (
    <>
      <PriceChangedDialog
        prompt={prompt.kind === "priceChanged" ? prompt : null}
        lines={lines}
        pending={sale.pending}
        onConfirm={() => sale.confirmPrices(rechoose)}
        onCancel={sale.dismissPrompt}
      />
      <OwnerPinDialog
        open={prompt.kind === "ownerPin"}
        title="PIN pemilik"
        requireReason={false}
        onSubmit={sale.confirmPin}
        onCancel={sale.dismissPrompt}
        error={
          prompt.kind === "ownerPin" ? (prompt.error ?? undefined) : undefined
        }
        pending={sale.pending}
      />
      <ReplayedSaleDialog
        sale={prompt.kind === "replayed" ? prompt.sale : null}
        onAccept={sale.acceptReplayed}
      />
    </>
  );
}
