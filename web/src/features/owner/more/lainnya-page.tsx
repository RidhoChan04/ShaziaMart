import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  HandCoins,
  Hourglass,
  LogOut,
  type LucideIcon,
  PackagePlus,
} from "lucide-react";
import {
  getGetOwnerTodaySummaryQueryKey,
  useGetOwnerTodaySummary,
  useListOwnerSupplierDebts,
  useOwnerLogout,
} from "@/shared/api/gen/owner/owner";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { clearOwnerSession } from "../auth/owner-session";
import { FitAmount } from "../common/fit-amount";
import { RowList } from "../products/detail/section";
import { unpaidSummary } from "./debts/debt-model";

const rowClass =
  "flex min-h-14 items-center gap-3 px-4 py-2 text-[17px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-primary text-primary-foreground"
    >
      <Icon className="size-[18px]" strokeWidth={2} />
    </span>
  );
}

/** Menu Lainnya: kartu daftar ala Settings (Barang masuk, Utang supplier, Kedaluwarsa), lalu Keluar. */
export function LainnyaPage() {
  const client = useQueryClient();
  const logout = useOwnerLogout({
    mutation: { onSuccess: () => clearOwnerSession(client) },
  });
  const debts = useListOwnerSupplierDebts();
  const { date } = useBusinessDay();
  // Kunci sama dengan Beranda: angka kedaluwarsa memakai ringkasan yang sudah ada, bukan daftar penuh.
  const summary = useGetOwnerTodaySummary({
    query: { queryKey: [...getGetOwnerTodaySummaryQueryKey(), date] },
  });
  const expiredCount = summary.data?.attention.expiry.expiredCount ?? 0;
  const unpaid = debts.data
    ? unpaidSummary(debts.data.debts, jakartaIsoDate(Date.now()))
    : null;

  return (
    <div className="grid gap-4 lg:max-w-2xl">
      <div className="overflow-hidden rounded-lg bg-surface">
        <RowList>
          <li>
            <Link
              to="/owner/lainnya/barang-masuk"
              className={`${rowClass} hover:bg-bg`}
            >
              <RowIcon icon={PackagePlus} />
              <span className="min-w-0 flex-1">Barang masuk</span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
            </Link>
          </li>
          <li>
            <Link
              to="/owner/lainnya/utang"
              className={`${rowClass} hover:bg-bg`}
            >
              <RowIcon icon={HandCoins} />
              <span className="min-w-0 flex-1">Utang supplier</span>
              {unpaid && unpaid.total > 0 && (
                <span className="max-w-[45%] min-w-0 shrink-0 basis-[9rem] text-muted tabular-nums">
                  <FitAmount
                    text={formatRupiah(unpaid.total)}
                    max={15}
                    min={11}
                    className="text-right"
                  />
                </span>
              )}
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
            </Link>
          </li>
          <li>
            <Link
              to="/owner/lainnya/kedaluwarsa"
              className={`${rowClass} hover:bg-bg`}
            >
              <RowIcon icon={Hourglass} />
              <span className="min-w-0 flex-1">Kedaluwarsa</span>
              {expiredCount > 0 && (
                <span className="shrink-0 font-semibold text-danger-ink tabular-nums">
                  {`${expiredCount} lewat`}
                </span>
              )}
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
            </Link>
          </li>
        </RowList>
      </div>
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" />
        Keluar
      </Button>
      {logout.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(logout.error)}
        </p>
      )}
    </div>
  );
}
