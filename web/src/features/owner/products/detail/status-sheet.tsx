import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useSetOwnerProductStatus } from "@/shared/api/gen/owner/owner";
import type {
  OwnerProduct,
  ProductStatus,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { useInvalidateProduct } from "./use-invalidate-product";

const STATUS_LABEL: Record<ProductStatus, string> = {
  aktif: "Aktif",
  tidak_diambil: "Tidak diambil lagi",
  nonaktif: "Nonaktif",
  menunggu_harga: "Menunggu harga jual",
};

// menunggu_harga bukan pilihan: status itu hanya berakhir saat harga jual disimpan.
const OPTIONS: {
  value: Exclude<ProductStatus, "menunggu_harga">;
  hint: string | null;
}[] = [
  { value: "aktif", hint: null },
  {
    value: "tidak_diambil",
    hint: "Tetap dijual sampai habis, tanpa peringatan menipis",
  },
  { value: "nonaktif", hint: "Hilang dari pencarian kasir; riwayat tetap" },
];

/** Baris `Status barang` yang membuka lembar pilihan status. */
export function StatusSheet({ product }: { product: OwnerProduct }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ProductStatus>(product.status);
  const invalidate = useInvalidateProduct(product.id);
  const save = useSetOwnerProductStatus({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        setOpen(false);
      },
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setChoice(product.status);
          save.reset();
        }
      }}
    >
      <SheetTrigger className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-[17px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <span>Status barang</span>
        <span className="flex items-center gap-1 text-muted">
          <span>{STATUS_LABEL[product.status]}</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-3 rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">Status barang</SheetTitle>
        <SheetDescription className="sr-only">
          Pilih apakah barang ini dijual, tidak diambil lagi, atau nonaktif
        </SheetDescription>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Status barang</legend>
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary",
                choice === o.value ? "bg-primary-soft" : "bg-bg",
              )}
            >
              <input
                type="radio"
                name="status"
                value={o.value}
                checked={choice === o.value}
                onChange={() => setChoice(o.value)}
                className="mt-1 size-5 shrink-0 accent-primary"
              />
              <span className="grid">
                <span className="text-[17px] font-semibold">
                  {STATUS_LABEL[o.value]}
                </span>
                {o.hint && (
                  <span className="text-[13px] text-muted">{o.hint}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        {save.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(save.error)}
          </p>
        )}
        <Button
          className="h-12 w-full text-[17px]"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              productId: product.id,
              data: { status: choice, scarce: product.scarce },
            })
          }
        >
          Simpan status
        </Button>
        <SheetClose asChild>
          <Button variant="outline" className="h-12 w-full text-[17px]">
            Batal
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
