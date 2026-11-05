import { Link } from "@tanstack/react-router";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import type { StaffLowStockItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useListStaffLowStock } from "@/shared/api/gen/staff/staff";
import { pesanError } from "@/shared/lib/error-messages";
import { formatQty } from "@/shared/lib/quantity";
import { Card } from "../receipt/form-ui";
import { StaffPageHeader } from "../staff-page-header";

/** Satu barang menipis: nama, batas minimum, tanda `Menipis`. Sisa stok sengaja tidak ditampilkan (hitung buta). */
export function LowStockRow({ item }: { item: StaffLowStockItem }) {
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <div className="font-medium">{item.productName}</div>
        <div className="text-[14px] text-muted tabular-nums">
          {`Batas ${formatQty(item.minQtyBase, item.unitSize, item.unitName)}`}
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-semibold text-warning-ink">
        <TriangleAlert aria-hidden="true" className="size-3" />
        Menipis
      </span>
    </li>
  );
}

/** Semua barang menipis (tanpa angka sisa stok). */
export function LowStockPage() {
  const query = useListStaffLowStock();
  const items = query.data ?? [];
  return (
    <div className="pb-8">
      <StaffPageHeader title="Stok menipis" />
      <div className="mx-auto max-w-xl px-4">
        <Link
          to="/staff"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-[15px] font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Beranda
        </Link>
        {query.isError && (
          <p role="alert" className="mt-4 text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
        )}
        {query.data && items.length === 0 && (
          <p className="mt-4 text-muted">Tidak ada barang menipis</p>
        )}
        {items.length > 0 && (
          <div className="mt-2">
            <Card>
              <ul className="divide-y divide-border">
                {items.map((i) => (
                  <LowStockRow key={i.productId} item={i} />
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
