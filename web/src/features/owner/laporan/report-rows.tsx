import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Layers,
  type LucideIcon,
  Shapes,
  TrendingDown,
  TriangleAlert,
  Users,
} from "lucide-react";
import { type ReactNode, useId } from "react";
import type {
  OpnameReport,
  ProductSales,
  StockReport,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah, formatSignedRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import type { ReportSearch } from "@/shared/lib/report-search";
import { RowList, Section } from "../products/detail/section";

const linkRowClass =
  "flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

function Chevron() {
  return (
    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
  );
}

/** `Paling laku`: 3 teratas urut omzet dari server + `Lihat semua` (P7). */
export function TopProducts({
  products,
  search,
}: {
  products: ProductSales[];
  search: ReportSearch;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      {/* Tinggi baris judul sama dengan `Section` (target sentuh 44 px lewat margin negatif). */}
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 id={id} className="text-[20px] font-bold tracking-[-0.02em]">
          Paling laku
        </h2>
        <Link
          to="/owner/laporan/paling-laku"
          search={search}
          className="-my-3 inline-flex min-h-11 items-center px-1 text-[15px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Lihat semua
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg bg-surface">
        {products.length === 0 ? (
          <p className="px-4 py-4 text-muted">Belum ada penjualan</p>
        ) : (
          <RowList>
            {products.map((p, i) => (
              <li
                key={p.productId ?? p.productName}
                className="flex min-h-14 items-center gap-3 px-4 py-2"
              >
                <span className="w-5 shrink-0 text-center font-semibold text-muted tabular-nums">
                  {i + 1}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="break-words">{p.productName}</span>
                  <span className="text-[13px] text-muted tabular-nums">
                    {formatQty(p.qtyBase, p.unitSize, p.unitName)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatRupiah(p.revenue)}
                </span>
              </li>
            ))}
          </RowList>
        )}
      </div>
    </section>
  );
}

/** `Tidak terjual ≥ 30 hari`: satu baris ringkasan menuju daftarnya. */
export function UnsoldSummary({
  unsold,
  search,
}: {
  unsold: StockReport["unsold"];
  search: ReportSearch;
}) {
  return (
    <Section title={`Tidak terjual ≥ ${unsold.minDays} hari`}>
      {unsold.count === 0 ? (
        <p className="px-4 py-4 text-muted">
          {`Semua barang terjual dalam ${unsold.minDays} hari terakhir`}
        </p>
      ) : (
        <Link
          to="/owner/laporan/tidak-terjual"
          search={search}
          className={linkRowClass}
        >
          <span className="grid min-w-0 flex-1">
            <span>{`${unsold.count} barang`}</span>{" "}
            <span className="text-[13px] text-muted tabular-nums">
              {`Modal tertahan ${formatRupiah(unsold.heldValue)}`}
            </span>
          </span>
          <Chevron />
        </Link>
      )}
    </Section>
  );
}

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

function DetailRow({
  to,
  search,
  icon,
  title,
  trailing,
}: {
  to:
    | "/owner/laporan/kategori"
    | "/owner/laporan/kasir"
    | "/owner/laporan/selisih-opname"
    | "/owner/laporan/untung-tipis";
  search: ReportSearch;
  icon: LucideIcon;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <li>
      <Link to={to} search={search} className={`${linkRowClass} text-[17px]`}>
        <RowIcon icon={icon} />
        <span className="min-w-0 flex-1">{title}</span>
        {/* Spasi agar nama tautan terbaca "Selisih opname −Rp412.000", bukan menempel. */}
        {trailing && " "}
        {trailing}
        <Chevron />
      </Link>
    </li>
  );
}

/** Rincian (P9): Per kategori, Per kasir, Selisih opname (pengaman 4), Untung tipis. */
export function DetailLinks({
  search,
  opname,
  thinMargin,
}: {
  search: ReportSearch;
  opname: OpnameReport;
  thinMargin: StockReport["thinMargin"];
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface">
      <RowList>
        <DetailRow
          to="/owner/laporan/kategori"
          search={search}
          icon={Shapes}
          title="Per kategori"
        />
        <DetailRow
          to="/owner/laporan/kasir"
          search={search}
          icon={Users}
          title="Per kasir"
        />
        <DetailRow
          to="/owner/laporan/selisih-opname"
          search={search}
          icon={TrendingDown}
          title="Selisih opname"
          trailing={
            <span className="shrink-0 text-[15px] text-muted tabular-nums">
              {formatSignedRupiah(-opname.lossValue)}
            </span>
          }
        />
        <DetailRow
          to="/owner/laporan/untung-tipis"
          search={search}
          icon={Layers}
          title="Untung tipis"
          trailing={
            thinMargin.count === 0 ? (
              <span className="shrink-0 text-[15px] text-muted">Tidak ada</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning-ink">
                <TriangleAlert aria-hidden="true" className="size-3" />
                {`${thinMargin.count} barang`}
              </span>
            )
          }
        />
      </RowList>
    </div>
  );
}
