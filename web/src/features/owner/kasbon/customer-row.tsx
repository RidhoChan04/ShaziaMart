import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { OwnerCustomerRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { FitAmount } from "../common/fit-amount";
import { AgeBadge } from "./age-badge";

/** Umur kasbon yang dianggap lama (aturan sama dengan kelompok `lebih_30_hari` dari server). */
const OVERDUE = "lebih_30_hari";

/** Satu pelanggan: nama + umur/limit di kiri, sisa (atau Lebih bayar) di kanan; semua angka dari server. */
export function CustomerRow({ customer }: { customer: OwnerCustomerRow }) {
  const { balance, ageDays, age } = customer;
  const limit = `limit ${formatRupiah(customer.creditLimit)}`;
  const overpaid = balance < 0;
  return (
    <li>
      <Link
        to="/owner/kasbon/$customerId"
        params={{ customerId: customer.id }}
        className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 text-[17px] leading-snug font-semibold">
              {customer.name}
            </span>
            {balance !== 0 && (
              // Lebar kolom tetap dari persentase baris: ukuran huruf tidak bergantung pada isinya sendiri.
              <span
                className={cn(
                  "shrink-0 text-right font-semibold tabular-nums",
                  overpaid ? "w-[54%]" : "w-[40%]",
                )}
              >
                <FitAmount
                  text={
                    overpaid
                      ? `Lebih bayar ${formatRupiah(-balance)}`
                      : formatRupiah(balance)
                  }
                  max={overpaid ? 14 : 17}
                  min={overpaid ? 11 : 12}
                  className={cn(overpaid && "text-muted")}
                />
              </span>
            )}
          </span>
          {/* Satu baris: angka tidak pernah terpisah dari satuannya (lebar penuh baris di bawah nama). */}
          <span className="text-[13px] whitespace-nowrap text-muted">
            {balance > 0 && ageDays !== null ? (
              age === OVERDUE ? (
                <>
                  <AgeBadge text={`${ageDays} hari`} /> {`· ${limit}`}
                </>
              ) : (
                `${ageDays} hari · ${limit}`
              )
            ) : balance === 0 ? (
              `Lunas · ${limit}`
            ) : (
              limit
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
