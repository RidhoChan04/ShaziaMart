import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getGetOwnerCustomerQueryKey,
  useCreateOwnerCreditPayment,
} from "@/shared/api/gen/owner/owner";
import type {
  OwnerCreditPaymentInputMethod,
  OwnerCustomer,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { repaymentProblem } from "@/shared/lib/credit-rules";
import { pesanError } from "@/shared/lib/error-messages";
import { newId } from "@/shared/lib/id";
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

const METHODS: { value: OwnerCreditPaymentInputMethod; label: string }[] = [
  { value: "transfer", label: "Transfer" },
  { value: "titip", label: "Tunai ke pemilik" },
];

function Choice({
  value,
  label,
  current,
  disabled,
  onSelect,
}: {
  value: OwnerCreditPaymentInputMethod;
  label: string;
  current: OwnerCreditPaymentInputMethod;
  disabled: boolean;
  onSelect: (value: OwnerCreditPaymentInputMethod) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-center text-[15px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary",
        current === value ? "bg-primary text-primary-foreground" : "bg-bg",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="cara-bayar"
        value={value}
        checked={current === value}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}

/**
 * Tombol `Catat pelunasan` + lembar bawah: pelunasan langsung oleh pemilik (Transfer atau Tunai ke
 * pemilik), tidak pernah masuk laci. `id` dibuat saat simpan pertama dan dipakai ulang oleh setiap
 * percobaan sampai ada yang berhasil (juga setelah lembar ditutup lalu dibuka lagi), selama nominal
 * dan cara bayarnya sama; respons yang hilang tidak menggandakan pelunasan. Nominal atau cara bayar
 * berubah = pelunasan lain = `id` baru (server mengulang catatan asli, bukan isi yang baru).
 */
export function OwnerPaymentSheet({
  customer,
  onSaved,
}: {
  customer: OwnerCustomer;
  onSaved: (saved: OwnerCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const pending = useRef<{
    id: string;
    amount: number;
    method: OwnerCreditPaymentInputMethod;
  } | null>(null);
  const [method, setMethod] =
    useState<OwnerCreditPaymentInputMethod>("transfer");
  const [text, setText] = useState("");
  const create = useCreateOwnerCreditPayment({
    mutation: {
      onSuccess: (saved) => {
        pending.current = null;
        setMethod("transfer");
        setText("");
        toast.success("Pelunasan tersimpan");
        onSaved(saved);
        setOpen(false);
      },
      // Respons bisa hilang padahal server sudah menyimpan: muat ulang agar pelunasan itu tampil.
      onError: () => {
        void client.invalidateQueries({
          queryKey: getGetOwnerCustomerQueryKey(customer.id),
        });
      },
    },
  });

  const { balance } = customer;
  const amount = parseRupiah(text);
  const problem = repaymentProblem(amount, balance);
  // Galat ditampilkan setelah ada isian; sebelum itu hanya tombol yang nonaktif.
  const shownProblem = text.trim() === "" ? null : problem;
  const errorText = create.isError ? pesanError(create.error) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && create.isPending) return;
        setOpen(next);
        if (next) create.reset();
      }}
    >
      <SheetTrigger asChild>
        <Button className="h-12 flex-1 text-[17px]" disabled={balance <= 0}>
          Catat pelunasan
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">
          Catat pelunasan
        </SheetTitle>
        <SheetDescription>{`Sisa kasbon ${formatRupiah(balance)}`}</SheetDescription>
        <div className="grid gap-1.5">
          <label
            htmlFor="nominal-pelunasan"
            className="text-[15px] font-semibold"
          >
            Nominal
          </label>
          <div className="flex gap-2">
            <input
              id="nominal-pelunasan"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Rp0"
              value={text}
              aria-invalid={shownProblem ? true : undefined}
              aria-describedby={
                shownProblem ? "nominal-pelunasan-galat" : undefined
              }
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                if (amount !== null) setText(formatRupiah(amount));
              }}
              className={cn(
                "h-11 w-0 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-right text-[17px] tabular-nums outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary",
                shownProblem && "border-danger text-danger",
              )}
            />
            <Button
              variant="outline"
              className="h-11 shrink-0"
              onClick={() => setText(formatRupiah(balance))}
            >
              Lunas semua
            </Button>
          </div>
          {shownProblem && (
            <p
              id="nominal-pelunasan-galat"
              className="text-[13px] font-medium text-danger"
            >
              {shownProblem}
            </p>
          )}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[15px] font-semibold">Cara bayar</legend>
          <div className="flex gap-2">
            {METHODS.map((m) => (
              <Choice
                key={m.value}
                value={m.value}
                label={m.label}
                current={method}
                disabled={create.isPending}
                onSelect={setMethod}
              />
            ))}
          </div>
          <p className="text-[13px] text-muted">Tidak masuk laci kasir.</p>
        </fieldset>
        {amount !== null && problem === null && (
          <p className="text-[15px] font-semibold">
            {`Sisa setelah ini ${formatRupiah(balance - amount)}`}
          </p>
        )}
        {errorText !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {errorText}
          </p>
        )}
        <Button
          className="h-12 w-full text-[17px]"
          disabled={problem !== null || create.isPending}
          onClick={() => {
            if (amount === null) return;
            const kept = pending.current;
            const same =
              kept !== null && kept.amount === amount && kept.method === method;
            const id = same ? kept.id : newId();
            pending.current = { id, amount, method };
            create.mutate({
              customerId: customer.id,
              data: { id, amount, method },
            });
          }}
        >
          Simpan pelunasan
        </Button>
        <SheetClose asChild>
          <Button
            variant="outline"
            className="h-12 w-full text-[17px]"
            disabled={create.isPending}
          >
            Batal
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
