import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { markup } from "@/shared/lib/product-rules";
import { FitAmount } from "../../common/fit-amount";
import { type PriceLineView, priceLines } from "../price-lines";
import { RowList, Section } from "./section";

/** `Modal Rp2.600 · untung Rp500 (19% dari modal)`; persen selalu dari modal. */
function costNote(line: Pick<PriceLineView, "price" | "cost">): string {
  const m = markup(line.price, line.cost);
  if (line.cost === null || m === null) return "Modal belum diisi";
  const verb = m.profit < 0 ? "rugi" : "untung";
  const amount = formatRupiah(Math.abs(m.profit));
  const pct = m.percent === null ? "" : ` (${Math.abs(m.percent)}% dari modal)`;
  return `Modal ${formatRupiah(line.cost)} · ${verb} ${amount}${pct}`;
}

export function PriceCard({ product }: { product: OwnerProduct }) {
  return (
    <Section title="Harga">
      <RowList>
        {priceLines(product).map((line) => (
          <li key={line.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[17px] font-semibold">
                {line.label}
                <span className="text-[15px] font-normal text-muted">
                  {" "}
                  · {line.detail}
                </span>
              </span>
              <span className="w-[38%] shrink-0 text-right font-bold tabular-nums">
                <FitAmount text={formatRupiah(line.price)} max={17} min={13} />
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted tabular-nums">
              {costNote(line)}
            </p>
          </li>
        ))}
      </RowList>
    </Section>
  );
}
