import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getGetOwnerTodaySummaryQueryKey,
  useGetOwnerQrisDay,
  useMarkOwnerQrisDay,
} from "@/shared/api/gen/owner/owner";
import type { QrisDayDetail as QrisDetail } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  formatIsoDayMonth,
  jakartaIsoDate,
  jakartaTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";
import { QrisDayDetail, QrisStatusMark, qrisDayLabel } from "./qris-day-detail";

const QRIS_PREFIX = "/api/owner/qris-days";

/**
 * Tandai satu hari QRIS. Setelah berhasil, semua daftar/rincian QRIS dan ringkasan Beranda
 * (butir `QRIS belum dicocokkan`) dimuat ulang.
 */
export function useMarkQrisDay() {
  const client = useQueryClient();
  return useMarkOwnerQrisDay({
    mutation: {
      onSuccess: () => {
        void client.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            q.queryKey[0].startsWith(QRIS_PREFIX),
        });
        void client.invalidateQueries({
          queryKey: getGetOwnerTodaySummaryQueryKey(),
        });
      },
    },
  });
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function markedLine(day: QrisDetail): string {
  const who = `${day.markedByName} · ${formatIsoDayMonth(jakartaIsoDate(day.markedAt ?? 0))} ${jakartaTime(day.markedAt ?? 0)}`;
  if (day.changedAfterMark || day.status === "belum") return `Ditandai ${who}`;
  return `Ditandai ${day.status === "cocok" ? "Cocok" : "Tidak cocok"} · ${who}`;
}

function NoteField({
  value,
  missing,
  onChange,
}: {
  value: string;
  missing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="catatan-qris" className="text-[15px] font-semibold">
        Catatan
      </label>
      <textarea
        id="catatan-qris"
        rows={2}
        maxLength={200}
        placeholder="Wajib bila tidak cocok"
        value={value}
        aria-invalid={missing ? true : undefined}
        aria-describedby={missing ? "catatan-qris-galat" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-16 w-full rounded-md border border-border bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary"
      />
      {missing && (
        <p
          id="catatan-qris-galat"
          className="text-[13px] font-medium text-danger"
        >
          Isi catatan bila tidak cocok
        </p>
      )}
    </div>
  );
}

function DayForm({
  day,
  pending,
  error,
  onSubmit,
  onList,
}: {
  day: QrisDetail;
  pending: boolean;
  error: string | null;
  onSubmit: (status: "cocok" | "tidak_cocok", note: string) => void;
  onList: () => void;
}) {
  // Catatan lama jadi isian awal; selama diketik, isian milik pengguna.
  const [note, setNote] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const text = note ?? day.note ?? "";
  const submit = (status: "cocok" | "tidak_cocok") => {
    if (status === "tidak_cocok" && text.trim() === "") {
      setMissing(true);
      return;
    }
    setMissing(false);
    onSubmit(status, text.trim());
  };
  return (
    <>
      <div>
        <QrisStatusMark day={day} />
        {day.markedAt !== null && day.markedByName !== null && (
          <p className="mt-1 text-[13px] text-muted">{markedLine(day)}</p>
        )}
      </div>
      <dl className="divide-y divide-border rounded-lg bg-bg px-4">
        <Line label="Penjualan" value={formatRupiah(day.sales)} />
        <Line label="Pelunasan" value={formatRupiah(day.repayments)} />
        <Line label="Total" value={formatRupiah(day.total)} />
      </dl>
      {day.voidedCount > 0 && (
        <p className="text-[13px] text-muted">
          {`Dibatalkan: ${day.voidedCount} transaksi · ${formatRupiah(day.voidedTotal)}`}
        </p>
      )}
      <Button variant="outline" className="h-11 w-full" onClick={onList}>
        Lihat transaksi
      </Button>
      <NoteField
        value={text}
        missing={missing}
        onChange={(v) => {
          setNote(v);
          setMissing(false);
        }}
      />
      {error !== null && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {day.closed && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-12 text-[17px]"
            disabled={pending}
            onClick={() => submit("tidak_cocok")}
          >
            Tidak cocok
          </Button>
          <Button
            className="h-12 text-[17px]"
            disabled={pending}
            onClick={() => submit("cocok")}
          >
            Cocok
          </Button>
        </div>
      )}
    </>
  );
}

/** Lembar satu hari QRIS: rincian, daftar transaksi, catatan, lalu Cocok / Tidak cocok (catatan wajib untuk Tidak cocok). */
export function QrisMarkSheet({
  date,
  open,
  onClose,
  onMarked,
}: {
  date: string;
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah hari berhasil ditandai, sebelum lembar ditutup. */
  onMarked?: () => void;
}) {
  const query = useGetOwnerQrisDay(date, { query: { enabled: open } });
  const mark = useMarkQrisDay();
  const [listOpen, setListOpen] = useState(false);
  // Setelah berhasil ditandai pemanggil yang mengatur fokus (pemicunya mungkin sudah hilang).
  const handlesFocus = useRef(false);
  const day = query.data;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next || mark.isPending) return;
          mark.reset();
          onClose();
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            if (handlesFocus.current) e.preventDefault();
          }}
          className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
        >
          <SheetTitle className="text-[20px] font-bold">
            {`QRIS ${qrisDayLabel(date)}`}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Cocokkan total QRIS hari ini dengan mutasi bank.
          </SheetDescription>
          {query.isError ? (
            <div role="alert" className="grid gap-2 text-sm text-danger">
              {pesanError(query.error)}
              <Button variant="outline" onClick={() => void query.refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : day === undefined ? (
            <p className="text-sm text-muted">Memuat…</p>
          ) : (
            <DayForm
              day={day}
              pending={mark.isPending}
              error={mark.isError ? pesanError(mark.error) : null}
              onList={() => setListOpen(true)}
              onSubmit={(status, note) =>
                mark.mutate(
                  { date, data: { status, note: note === "" ? null : note } },
                  {
                    onSuccess: () => {
                      toast.success("QRIS ditandai");
                      handlesFocus.current = onMarked !== undefined;
                      onMarked?.();
                      onClose();
                    },
                  },
                )
              }
            />
          )}
          <SheetClose asChild>
            <Button
              variant="outline"
              className="h-12 w-full text-[17px]"
              disabled={mark.isPending}
            >
              Batal
            </Button>
          </SheetClose>
        </SheetContent>
      </Sheet>
      <QrisDayDetail
        date={date}
        open={open && listOpen}
        onClose={() => setListOpen(false)}
      />
    </>
  );
}
