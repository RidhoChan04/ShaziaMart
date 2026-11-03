import { Link } from "@tanstack/react-router";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useListOwnerSupplierDebts } from "@/shared/api/gen/owner/owner";
import type { SupplierDebt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  businessDay,
  businessDayLabel,
  formatIsoDate,
  jakartaIsoDate,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { paidSummary } from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import { FitAmount } from "../../common/fit-amount";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList, Section } from "../../products/detail/section";
import { dueText, groupBySupplier, unpaidSummary } from "./debt-model";
import { DueBadge } from "./due-badge";

const rowClass =
  "flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

function DebtRow({
  debt,
  today,
  paid,
}: {
  debt: SupplierDebt;
  today: string;
  paid?: boolean;
}) {
  return (
    <li>
      <Link
        to="/owner/lainnya/utang/$receiptId"
        params={{ receiptId: debt.receiptId }}
        className={rowClass}
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 text-base">{`Nota ${formatIsoDate(debt.notaDate)}`}</span>
            <span className="min-w-0 flex-1 font-semibold tabular-nums">
              <FitAmount
                text={formatRupiah(debt.amount)}
                max={16}
                min={12}
                className="text-right"
              />
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            {paid && debt.paid ? (
              <span>{paidSummary(debt.paid)}</span>
            ) : (
              <>
                <span>{dueText(debt.dueDate, today)}</span>
                <DueBadge dueDate={debt.dueDate} today={today} />
              </>
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

/** Utang supplier (9a): ringkasan belum dibayar, nota per supplier dengan tanda jatuh tempo, lalu yang sudah lunas. */
export function DebtsPage() {
  const query = useListOwnerSupplierDebts();
  const now = Date.now();
  const today = jakartaIsoDate(now);
  const debts = query.data?.debts;
  const header = (
    <SubPageHeader
      title="Utang supplier"
      eyebrow={businessDayLabel(businessDay(now))}
      back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
    />
  );

  if (!debts) {
    return (
      <div>
        {header}
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

  const summary = unpaidSummary(debts, today);
  const groups = groupBySupplier(debts);
  const settled = debts.filter((d) => d.paid !== null);
  return (
    <div className="pb-24 lg:pb-8">
      {header}
      <div className="grid gap-5 lg:max-w-2xl">
        <section
          aria-label="Ringkasan utang"
          className="rounded-lg bg-surface p-4"
        >
          <p className="text-[13px] font-semibold text-muted">Belum dibayar</p>
          <FitAmount
            text={formatRupiah(summary.total)}
            max={34}
            min={20}
            className="font-bold tracking-[-0.02em]"
          />
          {summary.notes > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <span>{`${summary.notes} nota · ${summary.suppliers} supplier`}</span>
              {summary.overdue > 0 && (
                <span className="inline-flex items-center gap-1 font-semibold text-danger-ink">
                  <TriangleAlert aria-hidden="true" className="size-3.5" />
                  {`${summary.overdue} lewat jatuh tempo`}
                </span>
              )}
            </div>
          )}
        </section>

        {groups.length === 0 && (
          <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
            Tidak ada utang supplier
          </p>
        )}
        {groups.map((g) => (
          <Section
            key={g.supplierName}
            title={g.supplierName}
            trailing={formatRupiah(g.total)}
          >
            <RowList>
              {g.debts.map((d) => (
                <DebtRow key={d.receiptId} debt={d} today={today} />
              ))}
            </RowList>
          </Section>
        ))}

        {settled.length > 0 && (
          <Section title="Sudah lunas">
            <RowList>
              {settled.map((d) => (
                <DebtRow key={d.receiptId} debt={d} today={today} paid />
              ))}
            </RowList>
          </Section>
        )}
      </div>
    </div>
  );
}
