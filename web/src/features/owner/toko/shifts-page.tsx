import { Link, useSearch } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import {
  useGetOwnerSettings,
  useListOwnerShifts,
} from "@/shared/api/gen/owner/owner";
import type {
  OwnerCashTake,
  OwnerShiftRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  addIsoDays,
  isIsoDate,
  jakartaIsoDate,
  jakartaTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah, formatSignedRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { saleDayLabel } from "../more/sales/sales-model";
import { RowList } from "../products/detail/section";
import { CancelTakeSheet } from "./cancel-take-sheet";
import { CashTakeSheet } from "./cash-take-sheet";

const rowClass =
  "flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";
const stepClass =
  "grid size-12 shrink-0 place-items-center text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

type Entry =
  | { kind: "shift"; at: number; shift: OwnerShiftRow }
  | { kind: "take"; at: number; take: OwnerCashTake };

/**
 * Shift dan pengambilan di sela shift dalam satu daftar, terbaru dulu: shift menurut jam buka,
 * pengambilan menurut jamnya (hanya urutan tampil; tidak ada angka uang yang dihitung).
 */
function entriesOf(
  shifts: readonly OwnerShiftRow[],
  takes: readonly OwnerCashTake[],
): Entry[] {
  const all: Entry[] = [
    ...shifts.map((shift) => ({
      kind: "shift" as const,
      at: shift.openedAt,
      shift,
    })),
    ...takes.map((take) => ({ kind: "take" as const, at: take.at, take })),
  ];
  return all.sort((a, b) => b.at - a.at);
}

/** Selisih yang menjadi butir Perlu perhatian (nilai mutlak ≥ batas) diberi tanda; di bawahnya ditulis biasa. */
function DifferenceLine({
  difference,
  flagMin,
}: {
  difference: number;
  flagMin: number | null;
}) {
  if (difference === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <CircleCheck aria-hidden="true" className="size-3.5 text-primary" />
        Cocok
      </span>
    );
  }
  const flagged = flagMin !== null && Math.abs(difference) >= flagMin;
  if (!flagged)
    return <span>{`Selisih ${formatSignedRupiah(difference)}`}</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        difference < 0
          ? "bg-danger-soft text-danger-ink"
          : "bg-warning-soft text-warning-ink"
      }`}
    >
      <TriangleAlert aria-hidden="true" className="size-3" />
      {`Selisih ${formatSignedRupiah(difference)}`}
    </span>
  );
}

function ShiftRow({
  shift,
  flagMin,
}: {
  shift: OwnerShiftRow;
  flagMin: number | null;
}) {
  const open = shift.closedAt === null;
  return (
    <li>
      <Link
        to="/owner/lainnya/shift/$shiftId"
        params={{ shiftId: shift.id }}
        className={rowClass}
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-base break-words">
              {open
                ? `${shift.kasirName} · sejak ${jakartaTime(shift.openedAt)}`
                : `${shift.kasirName} · ${jakartaTime(shift.openedAt)}–${jakartaTime(shift.closedAt ?? 0)}`}
            </span>
            {shift.countedCash !== null && (
              <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                {formatRupiah(shift.countedCash)}
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
            {open ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                <CirclePlay aria-hidden="true" className="size-3" />
                Sedang buka
              </span>
            ) : (
              shift.difference !== null && (
                <DifferenceLine
                  difference={shift.difference}
                  flagMin={flagMin}
                />
              )
            )}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
}

function TakeRow({
  take,
  onOpen,
}: {
  take: OwnerCashTake;
  onOpen: () => void;
}) {
  const strike = take.cancelled !== null;
  const lineClass = strike ? "text-muted line-through" : "";
  const body = (
    <>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-base ${lineClass}`}>
            Diambil pemilik
          </span>
          <span
            className={`shrink-0 text-[15px] font-semibold tabular-nums ${lineClass}`}
          >
            {formatSignedRupiah(-take.amount)}
          </span>
        </span>
        <span className={`text-[13px] text-muted ${lineClass}`}>
          {take.note
            ? `${jakartaTime(take.at)} · ${take.note}`
            : jakartaTime(take.at)}
        </span>
        {take.cancelled !== null && (
          <span className="text-[13px] text-muted">
            {`Dibatalkan · ${take.cancelled.reason} · ${take.cancelled.byName} · ${jakartaTime(take.cancelled.at)}`}
          </span>
        )}
      </span>
      {!strike && (
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      )}
    </>
  );
  return (
    <li>
      {strike ? (
        <div className={rowClass.replace("hover:bg-bg", "")}>{body}</div>
      ) : (
        <button type="button" className={rowClass} onClick={onOpen}>
          {body}
        </button>
      )}
    </li>
  );
}

/** Lainnya > Shift & kas (pemilik): satu hari per halaman, terbaru dulu; ambil uang dari laci. */
export function ShiftsPage() {
  const search = useSearch({ from: "/owner/lainnya/shift" });
  const today = jakartaIsoDate(Date.now());
  const date =
    search.tanggal && isIsoDate(search.tanggal) ? search.tanggal : today;
  const query = useListOwnerShifts({ date });
  const settings = useGetOwnerSettings();
  const [takeId, setTakeId] = useState<string | null>(null);
  const list = query.data;
  const dayLink = (iso: string) => ({
    to: "/owner/lainnya/shift" as const,
    search: iso === today ? {} : { tanggal: iso },
  });
  const entries = list ? entriesOf(list.items, list.takes) : [];
  const selectedTake = list?.takes.find((t) => t.id === takeId) ?? null;

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title="Shift & kas"
        eyebrow={saleDayLabel(date)}
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      <div className="grid gap-4 lg:max-w-2xl">
        <CashTakeSheet
          openKasirName={list?.openKasirName ?? null}
          disabled={!list}
        />
        <section
          aria-label="Hari"
          className="flex items-center rounded-[14px] bg-surface"
        >
          <Link
            {...dayLink(addIsoDays(date, -1))}
            aria-label="Hari sebelumnya"
            className={stepClass}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
          <span className="min-w-0 flex-1 text-center font-semibold">
            {saleDayLabel(date)}
          </span>
          {date >= today ? (
            <button
              type="button"
              disabled
              aria-label="Hari berikutnya"
              className={`${stepClass} text-border`}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          ) : (
            <Link
              {...dayLink(addIsoDays(date, 1))}
              aria-label="Hari berikutnya"
              className={stepClass}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </Link>
          )}
        </section>

        {!list ? (
          query.isError ? (
            <div className="grid justify-items-start gap-3">
              <p role="alert" className="text-sm font-medium text-danger">
                {pesanError(query.error)}
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <p role="status" className="text-muted">
              Memuat…
            </p>
          )
        ) : entries.length === 0 ? (
          <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
            Tidak ada shift di tanggal ini
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface">
            <RowList>
              {entries.map((e) =>
                e.kind === "shift" ? (
                  <ShiftRow
                    key={`s-${e.shift.id}`}
                    shift={e.shift}
                    flagMin={settings.data?.attention.cashDiffMin ?? null}
                  />
                ) : (
                  <TakeRow
                    key={`t-${e.take.id}`}
                    take={e.take}
                    onOpen={() => setTakeId(e.take.id)}
                  />
                ),
              )}
            </RowList>
          </div>
        )}
      </div>
      <CancelTakeSheet take={selectedTake} onClose={() => setTakeId(null)} />
    </div>
  );
}
