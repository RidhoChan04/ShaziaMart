import { useNavigate } from "@tanstack/react-router";
import { useSetOwnerProductStatus } from "@/shared/api/gen/owner/owner";
import type {
  OwnerProduct,
  ProductStatus,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useInvalidateProduct } from "./use-invalidate-product";

/** Dialog `{nama} habis` dari Beranda (`?lembar=habis`); hanya terbuka bila barang memang tidak diambil lagi dan habis. Harus dijawab: tekan di luar tidak menutupnya. */
export function StockOutDialog({
  product,
  requested,
}: {
  product: OwnerProduct;
  requested: boolean;
}) {
  const navigate = useNavigate({ from: "/owner/barang/$productId" });
  const invalidate = useInvalidateProduct(product.id);
  const clearParam = () => void navigate({ search: {}, replace: true });
  const choose = useSetOwnerProductStatus({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        clearParam();
      },
    },
  });
  // Aturan sama dengan butir `stockOuts` di Beranda: stok yang belum pernah dihitung bukan "habis".
  const open =
    requested &&
    product.status === "tidak_diambil" &&
    product.stockCounted &&
    product.stock <= 0;
  const pick = (status: ProductStatus) =>
    choose.mutate({
      productId: product.id,
      data: { status, scarce: product.scarce },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) clearParam();
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{`${product.name} habis`}</DialogTitle>
          <DialogDescription>
            Barang ini tidak diambil lagi. Nonaktifkan agar tidak muncul di
            kasir, atau biarkan aktif bila ternyata hanya langka.
          </DialogDescription>
        </DialogHeader>
        {choose.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(choose.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={choose.isPending}
            onClick={() => pick("aktif")}
          >
            Biarkan aktif
          </Button>
          <Button disabled={choose.isPending} onClick={() => pick("nonaktif")}>
            Nonaktifkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
