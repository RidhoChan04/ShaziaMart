import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatDateLong } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import { historyLabel } from "../price-lines";
import { RowList, Section } from "./section";

const MAX_ENTRIES = 10;

/** Kontrak: `priceHistory` terbaru dulu. */
export function PriceHistoryCard({ product }: { product: OwnerProduct }) {
  const entries = product.priceHistory.slice(0, MAX_ENTRIES);
  return (
    <Section title="Riwayat harga">
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-[15px] text-muted">
          Belum ada perubahan harga
        </p>
      ) : (
        <RowList>
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-semibold">
                  {historyLabel(e)}
                </span>
                <span className="text-[15px] font-semibold tabular-nums">
                  {`${e.oldPrice === null ? "—" : formatRupiah(e.oldPrice)} → ${e.newPrice === null ? "dihapus" : formatRupiah(e.newPrice)}`}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted">
                {`${formatDateLong(e.at)} · ${e.source === "impor" ? "lewat Impor Excel" : "oleh Pemilik"}`}
              </p>
            </li>
          ))}
        </RowList>
      )}
    </Section>
  );
}
