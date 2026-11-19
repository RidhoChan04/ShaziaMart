import { Link, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useListOwnerQrisDays } from "@/shared/api/gen/owner/owner";
import type { QrisDay } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { addIsoDays, jakartaIsoDate } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import { QrisStatusMark, qrisBreakdown, qrisDayLabel } from "./qris-day-detail";
import { QrisMarkSheet } from "./qris-mark-sheet";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const stepClass =
  "grid size-12 shrink-0 place-items-center text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";
const rowClass =
  "flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left";

/** `2026-11` → `November 2026`. */
function monthTitle(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** Bulan sebelum/sesudah `month` (`YYYY-MM`). */
function shiftMonth(month: string, by: -1 | 1): string {
  const first = `${month}-01`;
  const day = by < 0 ? addIsoDays(first, -1) : addIsoDays(first, 31);
  return day.slice(0, 7);
}

function DayRow({ day, onOpen }: { day: QrisDay; onOpen: () => void }) {
  const body = (
    <>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="font-semibold">{qrisDayLabel(day.date)}</span>
        <span className="text-[13px] text-muted">{qrisBreakdown(day)}</span>
        <QrisStatusMark day={day} />
      </span>
      <span className="shrink-0 text-[17px] font-semibold tabular-nums">
        {formatRupiah(day.total)}
      </span>
      {day.closed && (
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      )}
    </>
  );
  return (
    <li>
      {day.closed ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${qrisDayLabel(day.date)}, ${formatRupiah(day.total)}`}
          className={`${rowClass} hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`}
        >
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

/** Lainnya > QRIS harian (S7): total QRIS per hari, tanda pencocokan per hari, per bulan. */
export function QrisPage() {
  const search = useSearch({ from: "/owner/lainnya/qris" });
  const thisMonth = jakartaIsoDate(Date.now()).slice(0, 7);
  const month = search.bulan ?? thisMonth;
  const query = useListOwnerQrisDays({ month });
  const [markDate, setMarkDate] = useState<string | null>(null);
  const items = query.data?.items;
  const monthLink = (m: string) => ({
    to: "/owner/lainnya/qris" as const,
    search: m === thisMonth ? {} : { bulan: m },
  });

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title="QRIS harian"
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      <div className="grid gap-4 lg:max-w-2xl">
        <section
          aria-label="Bulan"
          className="flex items-center rounded-[14px] bg-surface"
        >
          <Link
            {...monthLink(shiftMonth(month, -1))}
            aria-label="Bulan sebelumnya"
            className={stepClass}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
          <span className="min-w-0 flex-1 text-center font-semibold">
            {monthTitle(month)}
          </span>
          {month >= thisMonth ? (
            <button
              type="button"
              disabled
              aria-label="Bulan berikutnya"
              className={`${stepClass} text-border`}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          ) : (
            <Link
              {...monthLink(shiftMonth(month, 1))}
              aria-label="Bulan berikutnya"
              className={stepClass}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </Link>
          )}
        </section>

        {query.isError ? (
          <div role="alert" className="grid gap-2 text-sm text-danger">
            {pesanError(query.error)}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : items === undefined ? (
          <p className="px-1 text-sm text-muted">Memuat…</p>
        ) : items.length === 0 ? (
          <p className="px-1 text-[15px] text-muted">
            Belum ada transaksi QRIS pada bulan ini.
          </p>
        ) : (
          <section
            aria-label="Hari"
            className="overflow-hidden rounded-lg bg-surface"
          >
            <RowList>
              {items.map((day) => (
                <DayRow
                  key={day.date}
                  day={day}
                  onOpen={() => setMarkDate(day.date)}
                />
              ))}
            </RowList>
          </section>
        )}
      </div>
      {markDate !== null && (
        <QrisMarkSheet date={markDate} open onClose={() => setMarkDate(null)} />
      )}
    </div>
  );
}
