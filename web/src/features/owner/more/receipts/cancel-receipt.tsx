import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  getGetOwnerReceiptQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerReceiptsQueryKey,
  getListOwnerSupplierDebtsQueryKey,
  useCancelOwnerReceipt,
} from "@/shared/api/gen/owner/owner";
import type { OwnerReceipt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { cancelNoteText, laciPaidOf } from "@/shared/lib/payment-labels";
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

/** Setelah batal (juga batal ulang: server idempoten, 200 dengan nota apa adanya): daftar nota, utang, barang (stok dan modal berubah), dan ringkasan Beranda dimuat ulang. */
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

/** Tombol `Batalkan nota` + konfirmasi (alertdialog) yang menyebut uang laci yang kembali. */
export function CancelReceipt({ receipt }: { receipt: OwnerReceipt }) {
  const [open, setOpen] = useState(false);
  // Hanya setelah berhasil tombol pemicu hilang; selain itu fokus kembali ke pemicu (bawaan).
  const succeeded = useRef(false);
  const done = useInvalidateAfterCancel(receipt.id);
  const cancel = useCancelOwnerReceipt({
    mutation: {
      onSuccess: (saved) => {
        succeeded.current = true;
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
        onCloseAutoFocus={(e) => {
          if (!succeeded.current) return;
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
