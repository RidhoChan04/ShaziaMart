import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useListOwnerSupplierDebts } from "@/shared/api/gen/owner/owner";
import {
  formatIsoDate,
  jakartaIsoDate,
  relativeDayTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { paidSummary } from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import { FitAmount } from "../../common/fit-amount";
import { ReceiptPhotoRow } from "../../common/receipt-photo";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList, Section } from "../../products/detail/section";
import { dueText } from "./debt-model";
import { DueBadge } from "./due-badge";
import { PaySheet } from "./pay-sheet";

const rowClass = "flex min-h-14 items-center justify-between gap-3 px-4 py-2";

/** Detail utang (9b): nominal dari server, foto nota, jatuh tempo, dan `Tandai lunas` (tanpa pelunasan sebagian). */
export function DebtDetailPage() {
  const { receiptId } = useParams({ from: "/owner/lainnya/utang/$receiptId" });
  const navigate = useNavigate();
  // Tidak ada endpoint detail: data diambil dari daftar yang sama dengan halaman Utang supplier.
  const query = useListOwnerSupplierDebts();
  const now = Date.now();
  const today = jakartaIsoDate(now);
  const debt = query.data?.debts.find((d) => d.receiptId === receiptId);

  if (!query.data) {
    return query.isError ? (
      <div className="grid justify-items-start gap-3 pt-6">
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(query.error)}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Coba lagi
        </Button>
      </div>
    ) : (
      <p role="status" className="pt-6 text-muted">
        Memuat…
      </p>
    );
  }
  if (!debt) {
    return (
      <div className="grid justify-items-start gap-4 pt-6">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em]">
          Utang tidak ditemukan
        </h1>
        <Link
          to="/owner/lainnya/utang"
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Kembali ke utang supplier
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={`${debt.supplierName} · nota ${formatIsoDate(debt.notaDate)}`}
        back={{ label: "Utang", fallback: "/owner/lainnya/utang" }}
      />
      <div className="grid gap-5 lg:max-w-2xl">
        <section aria-label="Nominal" className="rounded-lg bg-surface p-4">
          <FitAmount
            text={formatRupiah(debt.amount)}
            max={34}
            min={20}
            className="font-bold tracking-[-0.02em]"
          />
          {debt.paid === null && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <span>{dueText(debt.dueDate, today)}</span>
              <DueBadge dueDate={debt.dueDate} today={today} />
            </p>
          )}
        </section>

        <Section title="Nota">
          <RowList>
            <li>
              <ReceiptPhotoRow
                photoId={debt.photoId}
                caption={`Dicatat ${debt.createdByName} · ${relativeDayTime(debt.createdAt, now)}`}
              />
            </li>
            <li className={rowClass}>
              <span>Jatuh tempo</span>
              <span className="text-muted">{formatIsoDate(debt.dueDate)}</span>
            </li>
            {debt.paid && (
              <li className={rowClass}>
                <span className="font-semibold">Lunas</span>
                <span className="text-right text-muted">
                  {`${paidSummary(debt.paid)} · ${debt.paid.byName}`}
                </span>
              </li>
            )}
          </RowList>
        </Section>

        {debt.paid === null && (
          <PaySheet
            debt={debt}
            drawerShift={query.data.drawerShift}
            onPaid={() => void navigate({ to: "/owner/lainnya/utang" })}
          />
        )}
      </div>
    </div>
  );
}
