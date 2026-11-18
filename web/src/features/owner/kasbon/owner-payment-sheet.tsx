import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
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

const REPLAYED_NOTICE =
  "Pelunasan ini sudah tersimpan sebelumnya — cek riwayat";
const CANCELLED_NOTICE =
  "Pelunasan ini sudah dibatalkan — simpan lagi untuk mencatat yang baru";
/** Id tertunda hanya dipakai ulang selama kirim ulang masuk akal; lewat itu pelunasan baru. */
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

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

/** Id pelunasan pemilik yang belum terkonfirmasi; disimpan halaman agar batal pelunasan bisa melepasnya. */
export type PendingOwnerPayment = {
  id: string;
  customerId: string;
  amount: number;
  method: OwnerCreditPaymentInputMethod;
  createdAt: number;
};

/**
 * Tombol `Catat pelunasan` + lembar bawah: pelunasan langsung oleh pemilik (Transfer atau Tunai ke
 * pemilik), tidak pernah masuk laci. `id` dibuat saat simpan pertama dan dipakai ulang oleh setiap
 * percobaan sampai berhasil atau ID_TAKEN (juga setelah lembar ditutup lalu dibuka lagi), selama nominal
 * dan cara bayarnya sama dan umurnya kurang dari 10 menit; respons yang hilang tidak menggandakan pelunasan. Nominal atau cara bayar
 * berubah = pelunasan lain = `id` baru (server mengulang catatan asli, bukan isi yang baru).
 * Replay rekaman yang sudah dibatalkan (200, baris riwayatnya dibatalkan) = belum tersimpan: id
 * dilepas, tanpa toast tersimpan, lembar tetap terbuka dengan pesan, dan simpan berikutnya id baru.
 */
export function OwnerPaymentSheet({
  customer,
  pending,
  onSaved,
}: {
  customer: OwnerCustomer;
  /** Id tertunda; batal pelunasan di halaman melepasnya bila id-nya sama. */
  pending: RefObject<PendingOwnerPayment | null>;
  onSaved: (saved: OwnerCustomer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cancelledReplay, setCancelledReplay] = useState(false);
  const client = useQueryClient();
  // Kirim terakhir: apakah memakai id tertunda yang sudah pernah dikirim, dan kapan.
  const attempt = useRef({ reused: false, knownBefore: false, at: 0 });
  const [method, setMethod] =
    useState<OwnerCreditPaymentInputMethod>("transfer");
  const [text, setText] = useState("");
  const create = useCreateOwnerCreditPayment({
    mutation: {
      onSuccess: (saved, variables) => {
        // Hook-level: tetap berjalan walau halaman sudah ditinggalkan.
        if (pending.current?.id === variables.data.id) pending.current = null;
        const mine = saved.history.find(
          (e) => e.payment?.id === variables.data.id,
        );
        if (mine?.cancelled) {
          // Rekaman lama sudah batal: uang belum tercatat; isian dibiarkan untuk disimpan lagi.
          setCancelledReplay(true);
          onSaved(saved);
          return;
        }
        setMethod("transfer");
        setText("");
        // Id dipakai ulang dan server sudah mengenalnya: riwayat sebelum kirim sudah memuatnya
        // (muat ulang setelah galat), atau, sebagai cadangan, entrinya lebih tua dari kirim ini.
        // Selalu tampilkan pemberitahuan, juga bila isinya sama.
        const { reused, knownBefore, at } = attempt.current;
        const replayed =
          reused &&
          (knownBefore ||
            saved.history.some(
              (e) => e.payment?.id === variables.data.id && e.at < at,
            ));
        if (replayed) toast.warning(REPLAYED_NOTICE);
        else toast.success("Pelunasan tersimpan");
        onSaved(saved);
        setOpen(false);
      },
      // Respons bisa hilang padahal server sudah menyimpan: muat ulang agar pelunasan itu tampil.
      onError: (error) => {
        if (error instanceof ApiError && error.code === "ID_TAKEN") {
          pending.current = null;
        }
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
        if (next) {
          create.reset();
          setCancelledReplay(false);
        }
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
        {cancelledReplay && (
          <p role="alert" className="text-sm font-medium text-danger">
            {CANCELLED_NOTICE}
          </p>
        )}
        <Button
          className="h-12 w-full text-[17px]"
          disabled={problem !== null || create.isPending}
          onClick={() => {
            if (amount === null) return;
            setCancelledReplay(false);
            const now = Date.now();
            const kept = pending.current;
            const same =
              kept !== null &&
              kept.customerId === customer.id &&
              kept.amount === amount &&
              kept.method === method &&
              now - kept.createdAt < PENDING_MAX_AGE_MS;
            const id = same ? kept.id : newId();
            attempt.current = {
              reused: same,
              knownBefore:
                same && customer.history.some((e) => e.payment?.id === id),
              at: now,
            };
            pending.current = {
              id,
              customerId: customer.id,
              amount,
              method,
              createdAt: same ? kept.createdAt : now,
            };
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
