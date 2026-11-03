import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ApiError } from "@/shared/api/fetcher";
import {
  getGetOwnerReceiptQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerReceiptsQueryKey,
  getListOwnerSupplierDebtsQueryKey,
  useCancelOwnerReceipt,
  useGetOwnerReceipt,
} from "@/shared/api/gen/owner/owner";
import type { OwnerReceipt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  formatIsoDate,
  jakartaIsoDate,
  relativeDayTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import {
  cancelNoteText,
  laciPaidOf,
  paidSummary,
  paymentSummary,
} from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { FitAmount } from "../../common/fit-amount";
import { ReceiptPhotoRow } from "../../common/receipt-photo";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList, Section } from "../../products/detail/section";
import { ReceiptBadgeView } from "./receipt-badge";
import { auditTitle, receiptLineDetail } from "./receipt-model";

const rowClass = "flex min-h-14 items-center justify-between gap-3 px-4 py-2";

/** Setelah batal: daftar nota, utang, barang (stok dan modal berubah), dan ringkasan Beranda dimuat ulang. */
function useInvalidateAfterCancel(receiptId: string) {
  const client = useQueryClient();
  return (saved: OwnerReceipt) => {
    client.setQueryData(getGetOwnerReceiptQueryKey(receiptId), saved);
    void client.invalidateQueries({ queryKey: getListOwnerReceiptsQueryKey() });
    void client.invalidateQueries({
      queryKey: getListOwnerSupplierDebtsQueryKey(),
    });
    void client.invalidateQueries({
      queryKey: getGetOwnerTodaySummaryQueryKey(),
    });
    // Daftar dan detail barang berbagi awalan kunci `/api/owner/products`.
    void client.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        q.queryKey[0].startsWith("/api/owner/products"),
    });
  };
}

function CancelReceipt({ receipt }: { receipt: OwnerReceipt }) {
  const [open, setOpen] = useState(false);
  const done = useInvalidateAfterCancel(receipt.id);
  const cancel = useCancelOwnerReceipt({
    mutation: {
      onSuccess: (saved) => {
        done(saved);
        setOpen(false);
      },
    },
  });
  const laci = laciPaidOf(receipt);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (cancel.isPending) return;
        setOpen(next);
        if (next) cancel.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-12 w-full text-[17px] text-danger"
        >
          Batalkan nota
        </Button>
      </DialogTrigger>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        // Tombol pemicu hilang setelah nota batal: fokus ke judul halaman, bukan ke body.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.querySelector<HTMLElement>("main h1")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Batalkan nota ini?</DialogTitle>
          <DialogDescription>{cancelNoteText(laci)}</DialogDescription>
        </DialogHeader>
        {cancel.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(cancel.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={cancel.isPending}>
              Kembali
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ receiptId: receipt.id })}
          >
            Batalkan nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotFound() {
  return (
    <div className="grid justify-items-start gap-4 pt-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em]">
        Nota tidak ditemukan
      </h1>
      <Link
        to="/owner/lainnya/barang-masuk"
        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Kembali ke barang masuk
      </Link>
    </div>
  );
}

/** Detail barang masuk (pemilik): foto, barang, pembayaran, status utang, riwayat, dan batalkan nota. */
export function ReceiptDetailPage() {
  const { receiptId } = useParams({
    from: "/owner/lainnya/barang-masuk/$receiptId",
  });
  const query = useGetOwnerReceipt(receiptId);
  const r = query.data;

  if (!r) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound />;
    }
    if (query.isError) {
      return (
        <div className="grid justify-items-start gap-3 pt-6">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      );
    }
    return (
      <p role="status" className="pt-6 text-muted">
        Memuat…
      </p>
    );
  }

  const now = Date.now();
  const cancelled = r.status === "dibatalkan";
  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={`${r.supplierName} · nota ${formatIsoDate(r.notaDate)}`}
        back={{
          label: "Barang masuk",
          fallback: "/owner/lainnya/barang-masuk",
        }}
      />
      <div className="grid gap-5 lg:max-w-2xl">
        <section aria-label="Total" className="rounded-lg bg-surface p-4">
          <FitAmount
            text={formatRupiah(r.total)}
            max={34}
            min={20}
            className={`font-bold tracking-[-0.02em] ${cancelled ? "text-muted line-through" : ""}`}
          />
          {cancelled && (
            <p className="mt-2">
              <ReceiptBadgeView
                badge={{ label: "Dibatalkan", tone: "neutral" }}
              />
            </p>
          )}
        </section>

        <Section title="Nota">
          <RowList>
            <li>
              <ReceiptPhotoRow
                photoId={r.photoId}
                caption={`Dicatat ${r.createdByName} · ${relativeDayTime(r.createdAt, now)}`}
              />
            </li>
          </RowList>
        </Section>

        <Section title="Barang">
          <RowList>
            {r.lines.map((l) => (
              <li
                key={l.lineId}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-[17px] font-semibold">
                    {l.productName}
                  </span>
                  <span className="text-[13px] text-muted">
                    {receiptLineDetail(l)}
                  </span>
                </span>
                <span className="w-[34%] shrink-0 text-right font-semibold tabular-nums">
                  <FitAmount
                    text={formatRupiah(l.subtotal)}
                    max={16}
                    min={11}
                  />
                </span>
              </li>
            ))}
          </RowList>
        </Section>

        <Section title="Pembayaran">
          <RowList>
            <li className={rowClass}>
              <span>{paymentSummary(r.payment)}</span>
            </li>
          </RowList>
        </Section>

        {r.payment.timing === "nanti" && (
          <Section title="Status">
            <RowList>
              <li className={rowClass}>
                {r.paid ? (
                  <>
                    <span className="font-semibold">{`Lunas ${formatIsoDate(jakartaIsoDate(r.paid.at))}`}</span>
                    <span className="text-right text-muted">
                      {`${paidSummary(r.paid)} · ${r.paid.byName}`}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold">Belum lunas</span>
                )}
              </li>
            </RowList>
          </Section>
        )}

        <Section title="Riwayat">
          <RowList>
            {r.audit.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <p className="text-[17px] font-semibold">{auditTitle(e)}</p>
                <p className="text-[13px] text-muted">
                  {relativeDayTime(e.at, now)}
                </p>
                {e.changes.length > 0 && (
                  <ul
                    // biome-ignore lint/a11y/noRedundantRoles: Safari/VoiceOver membuang semantik daftar bila list-style none
                    role="list"
                    className="mt-1 grid gap-0.5 text-[15px]"
                  >
                    {e.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </RowList>
        </Section>

        {!cancelled && <CancelReceipt receipt={r} />}
      </div>
    </div>
  );
}
