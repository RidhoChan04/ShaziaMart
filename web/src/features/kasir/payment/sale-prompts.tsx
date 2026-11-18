import type { CreditLimitProblem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { ReasonDialog } from "../common/reason-dialog";
import type { PaymentChoice } from "./payment-model";
import { PriceChangedDialog } from "./price-changed-dialog";
import { ReplayedSaleDialog } from "./replayed-sale-dialog";
import type { SaleSubmission } from "./use-submit-sale";

/** `{nama}: sisa … + kasbon ini … melewati limit … sebesar ….`; kelebihan = `excess` dari server (yang dicatat). */
function overLimitText(
  name: string,
  p: Pick<
    CreditLimitProblem,
    "balance" | "attempted" | "creditLimit" | "excess"
  >,
): string {
  return `${name}: sisa ${formatRupiah(p.balance)} + kasbon ini ${formatRupiah(p.attempted)} melewati limit ${formatRupiah(p.creditLimit)} sebesar ${formatRupiah(p.excess)}.`;
}

/** Jendela lanjutan saat menyimpan: harga berubah, kasbon lewat limit (alasan), transaksi sudah tersimpan. */
export function SalePrompts({
  sale,
  customerName,
  rechoose,
}: {
  sale: SaleSubmission;
  /** Pelanggan kasbon yang dipilih di jendela bayar. */
  customerName: string;
  /** Pilihan pembayaran dinilai ulang terhadap total keranjang terkini. */
  rechoose: () => PaymentChoice | null;
}) {
  const { prompt } = sale;
  const reason = prompt.kind === "creditReason" ? prompt : null;
  return (
    <>
      <PriceChangedDialog
        prompt={prompt.kind === "priceChanged" ? prompt : null}
        pending={sale.pending}
        onConfirm={() => sale.confirmPrices(rechoose)}
        onCancel={sale.dismissPrompt}
      />
      <ReasonDialog
        open={reason !== null}
        title="Kasbon melewati limit"
        description={reason ? overLimitText(customerName, reason.problem) : ""}
        confirmLabel="Simpan dengan alasan"
        confirmTone="primary"
        onSubmit={sale.confirmReason}
        onCancel={sale.dismissPrompt}
        error={reason?.error ?? undefined}
        pending={sale.pending}
      />
      <ReplayedSaleDialog
        sale={prompt.kind === "replayed" ? prompt.sale : null}
        onAccept={sale.acceptReplayed}
      />
    </>
  );
}
