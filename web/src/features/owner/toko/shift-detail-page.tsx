import { useParams } from "@tanstack/react-router";
import { Ban, ChevronRight, CirclePlay } from "lucide-react";
import { useState } from "react";
import { useGetOwnerShift } from "@/shared/api/gen/owner/owner";
import type {
  OwnerCashTake,
  OwnerDrawerExpense,
  OwnerShiftDetail,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate, jakartaTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah, formatSignedRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { saleDayLabel } from "../more/sales/sales-model";
import { RowList, Section } from "../products/detail/section";
import { CancelExpenseSheet } from "./cancel-expense-sheet";
import { CancelTakeSheet } from "./cancel-take-sheet";

const itemClass =
  "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

function Line({
  label,
  value,
  note,
  strong,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  strong?: boolean;
}) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
      <span className="grid min-w-0 gap-0.5">
        <span className={strong ? "font-semibold" : ""}>{label}</span>
        {note && <span className="text-[13px] text-muted">{note}</span>}
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "text-[17px] font-bold" : "text-[15px] font-semibold"}`}
      >
        {value}
      </span>
    </li>
  );
}

/** Baris kas keluar / pengambilan: aktif = tombol pembuka lembar, dibatalkan = dicoret + alasan, nama, jam. */
function ItemRow({
  at,
  text,
  amount,
  cancelled,
  onOpen,
}: {
  at: number;
  text: string | null;
  amount: number;
  cancelled: { at: number; byName: string; reason: string } | null;
  onOpen: () => void;
}) {
  const label = text ? `${jakartaTime(at)} · ${text}` : jakartaTime(at);
  const value = formatSignedRupiah(-amount);
  if (cancelled !== null) {
    return (
      <li className={itemClass}>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex items-baseline justify-between gap-3 text-muted line-through">
            <span className="min-w-0 break-words">{label}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">
              {value}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1 rounded-full bg-border px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-text">
              <Ban aria-hidden="true" className="size-3" />
              Dibatalkan
            </span>
            {`${cancelled.reason} · ${cancelled.byName} · ${jakartaTime(cancelled.at)}`}
          </span>
        </span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className={`${itemClass} hover:bg-bg`}
        onClick={onOpen}
      >
        <span className="min-w-0 flex-1 break-words">{label}</span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {value}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </button>
    </li>
  );
}

/** Kartu rumus laci: angka persis dari server; baris bernilai nol tidak tampil. */
function DrawerCard({ d }: { d: OwnerShiftDetail }) {
  const open = d.closedAt === null;
  const showSuggestion = d.suggestedOpening !== null && d.openingNote !== null;
  return (
    <div className="overflow-hidden rounded-lg bg-surface">
      <RowList>
        <Line
          label="Modal awal"
          value={formatRupiah(d.openingCash)}
          note={
            showSuggestion
              ? `Disarankan ${formatRupiah(d.suggestedOpening ?? 0)} · ${d.openingNote}`
              : undefined
          }
        />
        {d.cashSales !== 0 && (
          <Line
            label="Penjualan tunai"
            value={formatSignedRupiah(d.cashSales)}
          />
        )}
        {d.creditPayments !== 0 && (
          <Line
            label="Pelunasan kasbon"
            value={formatSignedRupiah(d.creditPayments)}
          />
        )}
        {d.supplierPayments !== 0 && (
          <Line
            label="Bayar supplier"
            value={formatSignedRupiah(-d.supplierPayments)}
          />
        )}
        {d.saleRefunds !== 0 && (
          <Line
            label="Pengembalian transaksi"
            value={formatSignedRupiah(-d.saleRefunds)}
          />
        )}
        {d.expenses !== 0 && (
          <Line label="Kas keluar" value={formatSignedRupiah(-d.expenses)} />
        )}
        {d.ownerTakes !== 0 && (
          <Line
            label="Diambil pemilik"
            value={formatSignedRupiah(-d.ownerTakes)}
          />
        )}
        <Line
          strong
          label={open ? "Uang seharusnya sejauh ini" : "Uang seharusnya"}
          value={formatRupiah(d.expectedCash)}
        />
        {d.countedCash !== null && (
          <Line label="Uang fisik" value={formatRupiah(d.countedCash)} />
        )}
        {d.difference !== null && (
          <Line label="Selisih" value={formatSignedRupiah(d.difference)} />
        )}
      </RowList>
    </div>
  );
}

/** Rincian laci satu shift (pemilik): rumus tunggal dari server, kas keluar, pengambilan pemilik, QRIS. */
export function ShiftDetailPage() {
  const { shiftId } = useParams({ from: "/owner/lainnya/shift/$shiftId" });
  const query = useGetOwnerShift(shiftId);
  const d = query.data;
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [takeId, setTakeId] = useState<string | null>(null);

  if (!d) {
    return (
      <div className="pb-24 lg:pb-8">
        <SubPageHeader
          title="Shift"
          back={{ label: "Shift & kas", fallback: "/owner/lainnya/shift" }}
        />
        {query.isError ? (
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
        )}
      </div>
    );
  }

  const open = d.closedAt === null;
  const times =
    d.closedAt === null
      ? `sejak ${jakartaTime(d.openedAt)}`
      : `${jakartaTime(d.openedAt)}–${jakartaTime(d.closedAt)}`;
  const expense: OwnerDrawerExpense | null =
    d.expenseItems.find((e) => e.id === expenseId) ?? null;
  const take: OwnerCashTake | null =
    d.ownerTakeItems.find((t) => t.id === takeId) ?? null;

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={`Shift ${d.kasirName}`}
        eyebrow={`${saleDayLabel(jakartaIsoDate(d.openedAt))} · ${times}`}
        back={{ label: "Shift & kas", fallback: "/owner/lainnya/shift" }}
      />
      <div className="grid gap-5 lg:max-w-2xl">
        {open && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
            <CirclePlay aria-hidden="true" className="size-3" />
            Sedang buka
          </span>
        )}
        <DrawerCard d={d} />
        {d.expenseItems.length > 0 && (
          <Section title="Kas keluar">
            <RowList>
              {[...d.expenseItems].reverse().map((e) => (
                <ItemRow
                  key={e.id}
                  at={e.at}
                  text={e.reason}
                  amount={e.amount}
                  cancelled={e.cancelled}
                  onOpen={() => setExpenseId(e.id)}
                />
              ))}
            </RowList>
          </Section>
        )}
        {d.ownerTakeItems.length > 0 && (
          <Section title="Diambil pemilik">
            <RowList>
              {[...d.ownerTakeItems].reverse().map((t) => (
                <ItemRow
                  key={t.id}
                  at={t.at}
                  text={t.note}
                  amount={t.amount}
                  cancelled={t.cancelled}
                  onOpen={() => setTakeId(t.id)}
                />
              ))}
            </RowList>
          </Section>
        )}
        {(d.qrisSales !== 0 || d.qrisRepayments !== 0) && (
          <Section title="QRIS">
            <RowList>
              <Line label="Penjualan" value={formatRupiah(d.qrisSales)} />
              <Line label="Pelunasan" value={formatRupiah(d.qrisRepayments)} />
            </RowList>
          </Section>
        )}
      </div>
      <CancelExpenseSheet
        expense={expense}
        kasirName={d.kasirName}
        onClose={() => setExpenseId(null)}
      />
      <CancelTakeSheet take={take} onClose={() => setTakeId(null)} />
    </div>
  );
}
