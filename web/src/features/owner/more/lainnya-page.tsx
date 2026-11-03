import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  HandCoins,
  LogOut,
  type LucideIcon,
  PackagePlus,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  useListOwnerSupplierDebts,
  useOwnerLogout,
} from "@/shared/api/gen/owner/owner";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { clearOwnerSession } from "../auth/owner-session";
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

function Value({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-[15px] whitespace-nowrap text-muted tabular-nums">
      {children}
    </span>
  );
}

/** Menu Lainnya: kartu daftar ala Settings (Barang masuk, Utang supplier), lalu Keluar. */
export function LainnyaPage() {
  const client = useQueryClient();
  const logout = useOwnerLogout({
    mutation: { onSuccess: () => clearOwnerSession(client) },
  });
  const debts = useListOwnerSupplierDebts();
  const unpaid = debts.data
    ? unpaidSummary(debts.data.debts, jakartaIsoDate(Date.now()))
    : null;

  return (
    <div className="grid gap-4 lg:max-w-2xl">
      <div className="overflow-hidden rounded-lg bg-surface">
        <RowList>
          {/* Rute Barang masuk menyusul (Task 13); sampai ada, baris ini tidak bisa diketuk. */}
          <li className={`${rowClass} text-muted`}>
            <RowIcon icon={PackagePlus} />
            <span className="min-w-0 flex-1">Barang masuk</span>
            <Value>Segera hadir</Value>
          </li>
          <li>
            <Link
              to="/owner/lainnya/utang"
              className={`${rowClass} hover:bg-bg`}
            >
              <RowIcon icon={HandCoins} />
              <span className="min-w-0 flex-1">Utang supplier</span>
              {unpaid && unpaid.total > 0 && (
                <Value>{formatRupiah(unpaid.total)}</Value>
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
