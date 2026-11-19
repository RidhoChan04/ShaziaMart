import { useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import { useCreateOwnerCashTake } from "@/shared/api/gen/owner/owner";
import { cn } from "@/shared/lib/cn";
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
import { refreshShifts } from "./shifts-cache";

const REPLAYED_NOTICE = "Pengambilan uang ini sudah tercatat sebelumnya";
const CANCELLED_NOTICE =
  "Pengambilan ini sudah dibatalkan — simpan lagi untuk mencatat yang baru";
/** Id tertunda hanya dipakai ulang selama kirim ulang masuk akal; lewat itu pengambilan baru. */
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const NOTE_MAX = 200;

type Pending = {
  id: string;
  amount: number;
  note: string;
  createdAt: number;
};

/**
 * Tombol `Ambil uang dari laci` + lembar bawah (S5). `id` dibuat saat simpan pertama dan dipakai
 * ulang oleh setiap percobaan sampai berhasil atau ID_TAKEN (juga setelah lembar ditutup lalu
 * dibuka lagi), selama nominal dan catatannya sama dan umurnya kurang dari 10 menit: respons yang
 * hilang tidak menggandakan pengambilan. Nominal atau catatan berubah = pengambilan lain = `id`
 * baru (server mengulang rekaman asli, bukan isi yang baru). Replay rekaman yang sudah dibatalkan
 * = belum tercatat: id dilepas, tanpa toast tercatat, isian dibiarkan.
 */
export function CashTakeSheet({
  openKasirName,
  disabled,
}: {
  /** Kasir shift yang sedang buka sekarang; null = tidak ada shift buka. */
  openKasirName: string | null;
  disabled: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [cancelledReplay, setCancelledReplay] = useState(false);
  const pending = useRef<Pending | null>(null);
  // Kirim terakhir: memakai id tertunda yang sudah pernah dikirim, dan kapan.
  const attempt = useRef({ reused: false, at: 0 });
  // Penjaga klik ganda: berlaku sebelum render ulang menonaktifkan tombol.
  const inFlight = useRef(false);

  const create = useCreateOwnerCashTake({
    mutation: {
      onSuccess: (saved, variables) => {
        inFlight.current = false;
        if (pending.current?.id === variables.data.id) pending.current = null;
        refreshShifts(client);
        if (saved.cancelled) {
          setCancelledReplay(true);
          return;
        }
        const { reused, at } = attempt.current;
        const replayed = reused && saved.at < at;
        setAmountText("");
        setNote("");
        if (replayed) toast.warning(REPLAYED_NOTICE);
        else toast.success("Pengambilan uang tercatat");
        setOpen(false);
      },
      // Respons bisa hilang padahal server sudah menyimpan: muat ulang agar pengambilan itu tampil.
      onError: (error) => {
        inFlight.current = false;
        if (error instanceof ApiError && error.code === "ID_TAKEN") {
          pending.current = null;
        }
        refreshShifts(client);
      },
    },
  });

  const amount = parseRupiah(amountText);
  const problem =
    amount === null || amount < 1 ? "Isi nominal minimal Rp1" : null;
  const shownProblem = amountText.trim() === "" ? null : problem;
  const errorText = create.isError ? pesanError(create.error) : null;
  const caption =
    openKasirName !== null
      ? `Mengurangi uang seharusnya shift ${openKasirName}.`
      : "Mengurangi modal shift berikutnya.";

  const save = () => {
    if (amount === null || amount < 1 || inFlight.current) return;
    inFlight.current = true;
    setCancelledReplay(false);
    const now = Date.now();
    const trimmed = note.trim();
    const kept = pending.current;
    const same =
      kept !== null &&
      kept.amount === amount &&
      kept.note === trimmed &&
      now - kept.createdAt < PENDING_MAX_AGE_MS;
    const id = same ? kept.id : newId();
    attempt.current = { reused: same, at: now };
    pending.current = {
      id,
      amount,
      note: trimmed,
      createdAt: same ? kept.createdAt : now,
    };
    create.mutate({
      data: { id, amount, note: trimmed === "" ? null : trimmed },
    });
  };

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
        <Button className="h-12 w-full text-[17px]" disabled={disabled}>
          <Banknote aria-hidden="true" className="size-5" />
          Ambil uang dari laci
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">
          Ambil uang dari laci
        </SheetTitle>
        <SheetDescription className="sr-only">{caption}</SheetDescription>
        <div className="grid gap-1.5">
          <label htmlFor="nominal-ambil" className="text-[15px] font-semibold">
            Nominal
          </label>
          <input
            id="nominal-ambil"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Rp0"
            value={amountText}
            aria-invalid={shownProblem ? true : undefined}
            aria-describedby={shownProblem ? "nominal-ambil-galat" : undefined}
            onChange={(e) => setAmountText(e.target.value)}
            onBlur={() => {
              if (amount !== null && amount >= 1) {
                setAmountText(formatRupiah(amount));
              }
            }}
            className={cn(
              "h-11 w-full rounded-md border border-border bg-transparent px-3 text-right text-[17px] tabular-nums outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary",
              shownProblem && "border-danger text-danger",
            )}
          />
          {shownProblem && (
            <p
              id="nominal-ambil-galat"
              className="text-[13px] font-medium text-danger"
            >
              {shownProblem}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="catatan-ambil" className="text-[15px] font-semibold">
            Catatan
          </label>
          <input
            id="catatan-ambil"
            maxLength={NOTE_MAX}
            autoComplete="off"
            placeholder="Opsional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-transparent px-3 text-[17px] outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <p className="text-[13px] text-muted">{caption}</p>
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
          onClick={save}
        >
          Simpan
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
