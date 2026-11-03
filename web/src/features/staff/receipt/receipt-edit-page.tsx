import { useNavigate, useParams } from "@tanstack/react-router";
import { Ban } from "lucide-react";
import { useGetStaffReceipt } from "@/shared/api/gen/staff/staff";
import { formatIsoDate } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { paymentSummary } from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import { EditForm } from "./edit-form";
import { formFromReceipt } from "./edit-model";
import { Card, SectionHeading } from "./form-ui";
import { lineSummary } from "./line-model";

/** Ubah nota; nota yang sudah dibatalkan hanya bisa dilihat. */
export function ReceiptEditPage() {
  const { receiptId } = useParams({ from: "/staff/masuk/$receiptId" });
  const navigate = useNavigate();
  const query = useGetStaffReceipt(receiptId);
  const receipt = query.data;
  const toList = () => void navigate({ to: "/staff/masuk" });

  if (query.isError) {
    return (
      <div className="grid max-w-xl gap-3">
        <p role="alert" className="font-medium text-danger">
          {pesanError(query.error)}
        </p>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={toList}
        >
          Kembali
        </Button>
      </div>
    );
  }
  if (!receipt) return null;
  if (receipt.status === "aktif") {
    return <EditForm key={receipt.id} receipt={receipt} />;
  }

  const form = formFromReceipt(receipt, null);
  return (
    <div className="mx-auto max-w-xl pb-6">
      <header className="flex items-center gap-3 py-3">
        <Button variant="outline" onClick={toList}>
          Kembali
        </Button>
        <div className="min-w-0">
          <h1 className="text-[20px] leading-tight font-bold">Barang masuk</h1>
          <p className="flex items-center gap-1 text-[13px] font-semibold text-muted">
            <Ban aria-hidden="true" className="size-3.5" />
            Dibatalkan
          </p>
        </div>
      </header>
      <SectionHeading>Nota</SectionHeading>
      <Card>
        <p className="flex min-h-12 items-center justify-between gap-3 px-4">
          <span>Supplier</span>
          <span className="min-w-0 truncate font-medium">
            {receipt.supplierName}
          </span>
        </p>
        <p className="flex min-h-12 items-center justify-between gap-3 px-4">
          <span>Tanggal nota</span>
          <span className="font-medium">{formatIsoDate(receipt.notaDate)}</span>
        </p>
      </Card>
      <SectionHeading aside={`${form.lines.length} baris`}>
        Barang
      </SectionHeading>
      <Card>
        {form.lines.map((l) => {
          const s = lineSummary(l);
          return (
            <div
              key={l.lineId}
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.title}</span>
                <span className="block text-[13px] text-muted tabular-nums">
                  {s.detail}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {s.subtotal === null ? "—" : formatRupiah(s.subtotal)}
              </span>
            </div>
          );
        })}
      </Card>
      <SectionHeading>Pembayaran</SectionHeading>
      <Card>
        <p className="flex min-h-14 items-center px-4 font-medium">
          {paymentSummary(receipt.payment)}
        </p>
      </Card>
    </div>
  );
}
