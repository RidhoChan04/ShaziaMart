import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useListOwnerReceipts } from "@/shared/api/gen/owner/owner";
import type { OwnerReceiptRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { FitAmount } from "../../common/fit-amount";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList } from "../../products/detail/section";
import { ReceiptBadgeView } from "./receipt-badge";
import { receiptBadge, receiptRowDetail } from "./receipt-model";

const rowClass =
  "flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

function ReceiptRow({ receipt }: { receipt: OwnerReceiptRow }) {
  const badge = receiptBadge(receipt);
  return (
    <li>
      <Link
        to="/owner/lainnya/barang-masuk/$receiptId"
        params={{ receiptId: receipt.id }}
        className={rowClass}
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[17px] leading-snug font-semibold">
            {receipt.supplierName}
          </span>
          <span className="text-[13px] text-muted">
            {receiptRowDetail(receipt)}
          </span>
        </span>
        <span className="grid max-w-[40%] min-w-0 shrink-0 basis-[7.5rem] justify-items-end gap-1">
          <span
            className={`w-full font-semibold tabular-nums ${receipt.status === "dibatalkan" ? "text-muted line-through" : ""}`}
          >
            <FitAmount
              text={formatRupiah(receipt.total)}
              max={16}
              min={11}
              className="text-right"
            />
          </span>
          {badge && <ReceiptBadgeView badge={badge} />}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
}

/** Barang masuk (pemilik): semua nota dari staf, terbaru dulu; ketuk untuk detail dan batalkan. */
export function ReceiptsPage() {
  const query = useListOwnerReceipts();
  const rows = query.data;
  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title="Barang masuk"
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      {!rows ? (
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
      ) : rows.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted lg:max-w-2xl">
          Belum ada barang masuk
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface lg:max-w-2xl">
          <RowList>
            {rows.map((r) => (
              <ReceiptRow key={r.id} receipt={r} />
            ))}
          </RowList>
        </div>
      )}
    </div>
  );
}
