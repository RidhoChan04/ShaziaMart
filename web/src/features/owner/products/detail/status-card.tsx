import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  getGetOwnerProductQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerProductMovementsQueryKey,
  getListOwnerProductsQueryKey,
  useDeleteOwnerProduct,
  useSetOwnerProductStatus,
} from "@/shared/api/gen/owner/owner";
import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import {
  PRODUCT_HAS_RECEIPTS_MESSAGE,
  PRODUCT_HAS_SALES_MESSAGE,
  pesanError,
  pesanHapusBarang,
} from "@/shared/lib/error-messages";
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
import { Section } from "./section";
import { StatusSheet } from "./status-sheet";
import { useInvalidateProduct } from "./use-invalidate-product";

/** Sakelar `Sedang langka`: berlaku langsung, tanpa tombol simpan. */
function ScarceSwitch({ product }: { product: OwnerProduct }) {
  const invalidate = useInvalidateProduct(product.id);
  const toggle = useSetOwnerProductStatus({
    mutation: { onSuccess: () => invalidate() },
  });
  return (
    <div className="px-4 py-3">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="grid">
          <span id="scarce-label" className="text-[17px]">
            Sedang langka
          </span>
          <span id="scarce-hint" className="text-[13px] text-muted">
            Peringatan stok diam sampai ada barang masuk
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={product.scarce}
          aria-labelledby="scarce-label"
          aria-describedby="scarce-hint"
          disabled={toggle.isPending}
          onClick={() =>
            toggle.mutate({
              productId: product.id,
              data: { status: product.status, scarce: !product.scarce },
            })
          }
          className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex h-8 w-[51px] items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none",
              product.scarce ? "bg-primary" : "bg-border",
            )}
          >
            <span
              className={cn(
                "size-7 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none",
                product.scarce && "translate-x-[19px]",
              )}
            />
          </span>
        </button>
      </div>
      {toggle.isError && (
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {pesanError(toggle.error)}
        </p>
      )}
    </div>
  );
}

function DeleteButton({ product }: { product: OwnerProduct }) {
  const client = useQueryClient();
  const navigate = useNavigate({ from: "/owner/barang/$productId" });
  const [open, setOpen] = useState(false);
  const remove = useDeleteOwnerProduct({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          client.invalidateQueries({
            queryKey: getListOwnerProductsQueryKey(),
          }),
          client.invalidateQueries({
            queryKey: getGetOwnerTodaySummaryQueryKey(),
          }),
        ]);
        await navigate({ to: "/owner/barang", replace: true });
        // Setelah halaman ditinggalkan, agar detail yang sudah terhapus tidak dimuat ulang.
        client.removeQueries({
          queryKey: getGetOwnerProductQueryKey(product.id),
        });
        client.removeQueries({
          queryKey: getListOwnerProductMovementsQueryKey(product.id),
        });
      },
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) remove.reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex min-h-14 w-full items-center px-4 text-left text-[17px] font-medium text-danger focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          Hapus barang
        </button>
      </DialogTrigger>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{`Hapus ${product.name}?`}</DialogTitle>
          <DialogDescription>
            Barang ini belum pernah terjual dan akan dihapus permanen.
          </DialogDescription>
        </DialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanHapusBarang(remove.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={remove.isPending}>
              Batal
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ productId: product.id })}
          >
            Hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Alasan barang tidak bisa dihapus (terjual, atau ada di nota barang masuk aktif — R32); null = boleh. */
function deleteBlockedReason(product: OwnerProduct): string | null {
  if (product.hasSales) return PRODUCT_HAS_SALES_MESSAGE;
  if (product.hasReceipts) return PRODUCT_HAS_RECEIPTS_MESSAGE;
  return null;
}

/** Status, tanda Sedang langka, dan hapus (hanya barang yang belum pernah terjual dan tanpa barang masuk aktif). */
export function StatusCard({ product }: { product: OwnerProduct }) {
  const blocked = deleteBlockedReason(product);
  return (
    <Section title="Pengaturan">
      <div className="divide-y divide-border">
        <StatusSheet product={product} />
        <ScarceSwitch product={product} />
        {blocked !== null ? (
          <p className="px-4 py-3 text-[13px] text-muted">{blocked}</p>
        ) : (
          <DeleteButton product={product} />
        )}
      </div>
    </Section>
  );
}
