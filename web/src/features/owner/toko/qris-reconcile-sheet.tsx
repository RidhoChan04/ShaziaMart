import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useListOwnerQrisDays } from "@/shared/api/gen/owner/owner";
import type { QrisDay } from "@/shared/api/gen/shaziaMartAPI.schemas";
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
import {
  QrisDayDetail,
  QrisStatusMark,
  qrisBreakdown,
  qrisDayLabel,
} from "./qris-day-detail";
import { QrisMarkSheet, useMarkQrisDay } from "./qris-mark-sheet";

function Row({
  day,
  busy,
  onCocok,
  onTidakCocok,
  onList,
}: {
  day: QrisDay;
  busy: boolean;
  onCocok: () => void;
  onTidakCocok: () => void;
  onList: () => void;
}) {
  return (
    <li data-day={day.date} className="grid gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{qrisDayLabel(day.date)}</span>
        <Button
          variant="ghost"
          className="h-11 px-2 text-[15px] text-primary"
          aria-label={`Lihat transaksi ${qrisDayLabel(day.date)}`}
          onClick={onList}
        >
          Lihat transaksi
        </Button>
      </div>
      <div className="grid gap-0.5">
        <span className="text-[17px] font-semibold tabular-nums">
          {formatRupiah(day.total)}
        </span>
        <span className="text-[13px] text-muted">{qrisBreakdown(day)}</span>
        {day.changedAfterMark && <QrisStatusMark day={day} />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-11"
          disabled={busy}
          aria-label={`Tidak cocok ${qrisDayLabel(day.date)}`}
          onClick={onTidakCocok}
        >
          Tidak cocok
        </Button>
        <Button
          className="h-11"
          disabled={busy}
          aria-label={`Cocok ${qrisDayLabel(day.date)}`}
          onClick={onCocok}
        >
          Cocok
        </Button>
      </div>
    </li>
  );
}

/**
 * Lembar `Cocokkan QRIS` (S11): hari-hari yang belum dicocokkan lintas bulan, terlama di atas.
 * Ditandai satu per satu (tidak ada tombol tandai semua); `Tidak cocok` membuka lembar hari itu
 * untuk catatan. Menutup sendiri saat daftar habis.
 */
export function QrisReconcileSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const query = useListOwnerQrisDays(
    { unreconciled: true },
    { query: { enabled: open } },
  );
  const mark = useMarkQrisDay();
  const [markDate, setMarkDate] = useState<string | null>(null);
  const [listDate, setListDate] = useState<string | null>(null);
  const items = query.data?.items;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Hari yang baru ditandai dan baris tujuan fokus (baris berikutnya, atau judul bila habis).
  const focusAfter = useRef<{ marked: string; next: string | null } | null>(
    null,
  );
  const armFocus = (date: string) => {
    const list = items ?? [];
    const at = list.findIndex((d) => d.date === date);
    focusAfter.current = {
      marked: date,
      next: list[at + 1]?.date ?? list[at - 1]?.date ?? null,
    };
  };
  const empty = query.isSuccess && !query.isFetching && items?.length === 0;

  useEffect(() => {
    if (open && empty) onClose();
  }, [open, empty, onClose]);

  // Baris yang ditandai hilang dari daftar: fokus pindah ke baris berikutnya (bukan ke body).
  useEffect(() => {
    const pending = focusAfter.current;
    if (!pending || !items || items.some((d) => d.date === pending.marked)) {
      return;
    }
    focusAfter.current = null;
    const next = pending.next
      ? listRef.current?.querySelector<HTMLElement>(
          `[data-day="${pending.next}"] button`,
        )
      : null;
    // Setelah Radix selesai mengembalikan fokus dari lembar anak (ke tombol yang sudah hilang).
    setTimeout(() => (next ?? titleRef.current)?.focus(), 0);
  }, [items]);

  const count = items?.length ?? 0;
  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
        >
          <SheetTitle
            ref={titleRef}
            tabIndex={-1}
            className="text-[20px] font-bold outline-none"
          >
            Cocokkan QRIS
          </SheetTitle>
          <SheetDescription>
            {items ? `${count} hari belum dicocokkan` : "Memuat…"}
          </SheetDescription>
          {query.isError && (
            <div role="alert" className="grid gap-2 text-sm text-danger">
              {pesanError(query.error)}
              <Button variant="outline" onClick={() => void query.refetch()}>
                Coba lagi
              </Button>
            </div>
          )}
          {mark.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {pesanError(mark.error)}
            </p>
          )}
          {items && items.length > 0 && (
            <ul
              ref={listRef}
              // biome-ignore lint/a11y/noRedundantRoles: Safari/VoiceOver membuang semantik daftar bila list-style none
              role="list"
              aria-label="Hari belum dicocokkan"
              className="divide-y divide-border overflow-hidden rounded-lg bg-bg"
            >
              {items.map((day) => (
                <Row
                  key={day.date}
                  day={day}
                  busy={mark.isPending}
                  onList={() => setListDate(day.date)}
                  onTidakCocok={() => setMarkDate(day.date)}
                  onCocok={() =>
                    mark.mutate(
                      { date: day.date, data: { status: "cocok" } },
                      {
                        onSuccess: () => {
                          armFocus(day.date);
                          toast.success("QRIS ditandai");
                        },
                      },
                    )
                  }
                />
              ))}
            </ul>
          )}
          <SheetClose asChild>
            <Button variant="outline" className="h-12 w-full text-[17px]">
              Tutup
            </Button>
          </SheetClose>
        </SheetContent>
      </Sheet>
      {open && markDate !== null && (
        <QrisMarkSheet
          date={markDate}
          open
          onClose={() => setMarkDate(null)}
          onMarked={() => armFocus(markDate)}
        />
      )}
      {open && listDate !== null && (
        <QrisDayDetail date={listDate} open onClose={() => setListDate(null)} />
      )}
    </>
  );
}
