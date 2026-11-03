import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import {
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerSupplierDebtsQueryKey,
  usePayOwnerSupplierDebt,
} from "@/shared/api/gen/owner/owner";
import type {
  DebtPaymentCashSource,
  DebtPaymentMethod,
  DrawerShift,
  SupplierDebt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import { pesanError, pesanPembayaran } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import {
  CASH_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/shared/lib/payment-labels";
import { NO_SHIFT_LACI } from "@/shared/lib/receipt-rules";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { FitAmount } from "../../common/fit-amount";

/** Utang tidak bisa dibayar lagi: daftar dimuat ulang akan melepas lembar ini, jadi pesannya lewat toast. */
const GONE_CODES = new Set(["DEBT_ALREADY_PAID", "RECEIPT_CANCELLED"]);

const SOURCE_NOTE = `"${CASH_SOURCE_LABEL.laci}" dicatat sebagai uang keluar di shift yang sedang buka.`;

function Choice<T extends string>({
  name,
  value,
  current,
  label,
  disabled,
  onSelect,
}: {
  name: string;
  value: T;
  current: T | null;
  label: string;
  disabled?: boolean;
  onSelect: (value: T) => void;
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
        name={name}
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
 * Tombol `Tandai lunas` + lembar bawah (nominal dari server, tanpa pembayaran sebagian).
 * `Uang dari` hanya muncul bila Tunai dan ada shift buka (`drawerShift`); selain itu uang pemilik.
 * Bila server menjawab SHIFT_CLOSED, pilihan laci tetap terlihat (nonaktif) dan pemilik harus memilih ulang —
 * sumber uang tidak pernah diganti diam-diam.
 * DEBT_ALREADY_PAID / RECEIPT_CANCELLED: lembar ditutup, pesan lewat toast, lalu `onGone`
 * (halaman memindahkan fokus ke judulnya setelah data baru tampil).
 */
export function PaySheet({
  debt,
  drawerShift,
  onPaid,
  onGone,
}: {
  debt: SupplierDebt;
  drawerShift: DrawerShift | null;
  onPaid: () => void;
  onGone: () => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  // Fokus tidak dikembalikan ke pemicu yang akan hilang; halaman yang memindahkannya.
  const gone = useRef(false);
  const [method, setMethod] = useState<DebtPaymentMethod>("tunai");
  const [source, setSource] = useState<NonNullable<DebtPaymentCashSource>>(
    drawerShift ? "laci" : "pemilik",
  );
  const pay = usePayOwnerSupplierDebt({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          client.invalidateQueries({
            queryKey: getListOwnerSupplierDebtsQueryKey(),
          }),
          client.invalidateQueries({
            queryKey: getGetOwnerTodaySummaryQueryKey(),
          }),
        ]);
        setOpen(false);
        onPaid();
      },
      // Daftar dimuat ulang agar `drawerShift` mutakhir (shift bisa tertutup sejak halaman dibuka).
      onError: (error) => {
        if (error instanceof ApiError && GONE_CODES.has(error.code)) {
          gone.current = true;
          toast.error(pesanError(error));
          setOpen(false);
          onGone();
        }
        void client.invalidateQueries({
          queryKey: getListOwnerSupplierDebtsQueryKey(),
        });
        void client.invalidateQueries({
          queryKey: getGetOwnerTodaySummaryQueryKey(),
        });
      },
    },
  });

  const laciUnavailable = drawerShift === null;
  const showSource =
    method === "tunai" && (!laciUnavailable || source === "laci");
  const blocked = showSource && laciUnavailable;
  const errorText = pay.isError ? pesanPembayaran(pay.error) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          gone.current = false;
          pay.reset();
          setMethod("tunai");
          setSource(drawerShift ? "laci" : "pemilik");
        }
      }}
    >
      <SheetTrigger asChild>
        <Button className="h-12 w-full text-[17px]">Tandai lunas</Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-3 rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
        onCloseAutoFocus={(e) => {
          if (gone.current) e.preventDefault();
        }}
      >
        <SheetTitle className="text-[20px] font-bold">Tandai lunas</SheetTitle>
        <SheetDescription>{`${debt.supplierName} · nota ${formatIsoDate(debt.notaDate)}`}</SheetDescription>
        <dl className="grid gap-3 rounded-lg bg-bg p-3">
          <div className="flex items-center justify-between gap-3">
            <dt>Nominal</dt>
            <dd className="min-w-0 flex-1 text-right font-bold">
              <FitAmount
                text={formatRupiah(debt.amount)}
                max={20}
                min={14}
                className="text-right"
              />
            </dd>
          </div>
        </dl>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[15px] font-semibold">Cara bayar</legend>
          <div className="flex gap-2">
            {(["tunai", "transfer"] as const).map((m) => (
              <Choice
                key={m}
                name="cara-bayar"
                value={m}
                current={method}
                label={PAYMENT_METHOD_LABEL[m]}
                onSelect={setMethod}
              />
            ))}
          </div>
        </fieldset>
        {showSource && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[15px] font-semibold">
              Uang dari
            </legend>
            <div className="flex gap-2">
              {(["laci", "pemilik"] as const).map((s) => (
                <Choice
                  key={s}
                  name="uang-dari"
                  value={s}
                  current={source}
                  label={CASH_SOURCE_LABEL[s]}
                  disabled={s === "laci" && laciUnavailable}
                  onSelect={setSource}
                />
              ))}
            </div>
            {source === "laci" && !laciUnavailable && (
              <p className="text-[13px] text-muted">{SOURCE_NOTE}</p>
            )}
            {/* Setelah 409 SHIFT_CLOSED kalimat yang sama sudah tampil sebagai galat: tidak diulang. */}
            {blocked && errorText !== NO_SHIFT_LACI && (
              <p className="text-[13px] text-muted">{NO_SHIFT_LACI}</p>
            )}
          </fieldset>
        )}
        {errorText !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {errorText}
          </p>
        )}
        <Button
          className="h-12 w-full text-[17px]"
          disabled={pay.isPending || blocked}
          onClick={() =>
            pay.mutate({
              receiptId: debt.receiptId,
              data: {
                method,
                cashSource:
                  method === "transfer"
                    ? null
                    : showSource
                      ? source
                      : "pemilik",
              },
            })
          }
        >
          Tandai lunas
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
