import { useState } from "react";
import { toast } from "sonner";
import { useSetOwnerCustomerCreditLimit } from "@/shared/api/gen/owner/owner";
import type { OwnerCustomer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

const LIMIT_ERROR = "Limit harus bilangan bulat minimal 0";

/**
 * Tombol `Atur limit` + lembar bawah. Limit boleh di bawah sisa kasbon (ruling R7): hanya
 * kasbon baru di kasir yang kena (melewati limit, perlu alasan); saldo yang ada tidak berubah.
 */
export function LimitSheet({
  customer,
  onSaved,
}: {
  customer: OwnerCustomer;
  onSaved: (saved: OwnerCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const save = useSetOwnerCustomerCreditLimit({
    mutation: {
      onSuccess: (saved) => {
        toast.success("Limit disimpan");
        onSaved(saved);
        setOpen(false);
      },
    },
  });

  const limit = parseRupiah(text);
  const invalid = limit === null;
  const owed = Math.max(0, customer.balance);
  const errorText = save.isError ? pesanError(save.error) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && save.isPending) return;
        setOpen(next);
        if (next) {
          setText(formatRupiah(customer.creditLimit));
          save.reset();
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" className="h-12 flex-1 text-[17px]">
          Atur limit
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">Atur limit</SheetTitle>
        <SheetDescription>{customer.name}</SheetDescription>
        <div className="grid gap-1.5">
          <label htmlFor="limit-kasbon" className="text-[15px] font-semibold">
            Limit kasbon
          </label>
          <input
            id="limit-kasbon"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Rp0"
            value={text}
            aria-invalid={invalid ? true : undefined}
            aria-describedby="limit-kasbon-catatan"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (limit !== null) setText(formatRupiah(limit));
            }}
            className={cn(
              "h-11 w-full rounded-md border border-border bg-transparent px-3 text-right text-[17px] tabular-nums outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary",
              invalid && "border-danger text-danger",
            )}
          />
          <div id="limit-kasbon-catatan" className="grid gap-0.5 text-[13px]">
            {invalid ? (
              <p className="font-medium text-danger">{LIMIT_ERROR}</p>
            ) : (
              <>
                <p className="text-muted">{`Sisa kasbon sekarang ${formatRupiah(owed)}.`}</p>
                {limit < owed && (
                  <p className="text-muted">
                    Kasbon baru di kasir akan melewati limit dan perlu alasan.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        {errorText !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {errorText}
          </p>
        )}
        <Button
          className="h-12 w-full text-[17px]"
          disabled={invalid || save.isPending}
          onClick={() => {
            if (limit === null) return;
            save.mutate({
              customerId: customer.id,
              data: { creditLimit: limit },
            });
          }}
        >
          Simpan limit
        </Button>
        <SheetClose asChild>
          <Button
            variant="outline"
            className="h-12 w-full text-[17px]"
            disabled={save.isPending}
          >
            Batal
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
