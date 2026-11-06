import { Link, useParams } from "@tanstack/react-router";
import { ApiError } from "@/shared/api/fetcher";
import { useGetOwnerSale } from "@/shared/api/gen/owner/owner";
import type { OwnerSale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { relativeDayTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList, Section } from "../../products/detail/section";
import { ReceiptBadgeView } from "../receipts/receipt-badge";
import { itemQty, partOf, paymentLines } from "./sales-model";
import { VoidSaleSheet } from "./void-sale-sheet";

const OPEN_SHIFT_NOTE = "Masih di shift yang buka — batalkan dari kasir";

function NotFound() {
  return (
    <div className="grid justify-items-start gap-4 pt-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em]">
        Transaksi tidak ditemukan
      </h1>
      <Link
        to="/owner/lainnya/transaksi"
        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Kembali ke transaksi
      </Link>
    </div>
  );
}

/** Kartu `Dibatalkan`: alasan, pembatal, jam; bila kasir yang batal, tugas transfer QRIS dan uang laci. */
function VoidedCard({ sale, now }: { sale: OwnerSale; now: number }) {
  const v = sale.voided;
  const qris = partOf(sale, "qris");
  const transfer =
    v !== null &&
    v.channel === "kasir" &&
    v.qrisRefundSource === "pemilik" &&
    qris > 0;
  return (
    <section
      aria-label="Dibatalkan"
      className="grid gap-1.5 rounded-lg bg-surface p-4"
    >
      <p>
        <ReceiptBadgeView badge={{ label: "Dibatalkan", tone: "neutral" }} />
      </p>
      {v && (
        <p className="text-[15px] break-words">
          {`${v.reason} · ${v.byName} · ${relativeDayTime(v.at, now)}`}
        </p>
      )}
      {transfer && (
        <p className="text-[15px] font-semibold text-warning-ink tabular-nums">
          {`QRIS ${formatRupiah(qris)} perlu ditransfer pemilik`}
        </p>
      )}
      {v && v.drawerRefund > 0 && (
        <p className="text-[13px] text-muted tabular-nums">
          {`Tunai ${formatRupiah(v.drawerRefund)} dikembalikan dari laci kasir`}
        </p>
      )}
    </section>
  );
}

/** Detail transaksi (pemilik): barang, pembayaran, dan `Batalkan transaksi` untuk shift yang sudah tutup. */
export function SaleDetailPage() {
  const { saleId } = useParams({ from: "/owner/lainnya/transaksi/$saleId" });
  const query = useGetOwnerSale(saleId);
  const sale = query.data;

  if (!sale) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <NotFound />;
    }
    if (query.isError) {
      return (
        <div className="grid justify-items-start gap-3 pt-6">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      );
    }
    return (
      <p role="status" className="pt-6 text-muted">
        Memuat…
      </p>
    );
  }

  const now = Date.now();
  const voided = sale.status === "dibatalkan";
  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={sale.number}
        eyebrow={`${relativeDayTime(sale.createdAt, now)} · ${sale.kasirName}`}
        back={{ label: "Transaksi", fallback: "/owner/lainnya/transaksi" }}
      />
      <div className="grid gap-5 lg:max-w-2xl">
        {voided && <VoidedCard sale={sale} now={now} />}

        <Section title="Barang">
          <RowList>
            {sale.items.map((i) => (
              <li
                key={`${i.unitId}-${i.qtyBase}`}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-[17px] break-words">
                    {i.productName}
                  </span>
                  <span className="text-[13px] text-muted">{itemQty(i)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatRupiah(i.subtotal)}
                </span>
              </li>
            ))}
          </RowList>
        </Section>

        <Section title="Pembayaran">
          <RowList>
            {paymentLines(sale).map((p) => (
              <li
                key={p.label}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0 break-words">{p.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {p.amount}
                </span>
              </li>
            ))}
          </RowList>
        </Section>

        {!voided &&
          (sale.shiftOpen ? (
            <p className="text-[15px]">{OPEN_SHIFT_NOTE}</p>
          ) : (
            <VoidSaleSheet sale={sale} />
          ))}
      </div>
    </div>
  );
}
