import { Link, useSearch } from "@tanstack/react-router";
import { ChevronRight, Repeat } from "lucide-react";
import { useGetOwnerOpnameReport } from "@/shared/api/gen/owner/owner";
import type { OpnameReportItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatSignedRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import { rangeLabel } from "@/shared/lib/report-period";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList, Section } from "../products/detail/section";
import { ReportState, StatCard, ToneBadge } from "./report-bits";

const noCost = <span className="text-[13px] text-muted">HPP belum ada</span>;

function ItemRow({
  item,
  search,
}: {
  item: OpnameReportItem;
  search: {
    periode: "hari" | "minggu" | "bulan" | "tanggal";
    dari: string;
    sampai: string;
  };
}) {
  const { shortCount, overCount, countTotal } = item;
  const detail: string[] = [];
  if (shortCount > 0) {
    detail.push(
      `kurang di ${shortCount} dari ${countTotal} · −${formatQty(item.shortQtyBase, item.unitSize, item.unitName)}`,
    );
  }
  if (overCount > 0) {
    detail.push(
      `lebih di ${overCount} dari ${countTotal} · +${formatQty(item.overQtyBase, item.unitSize, item.unitName)}`,
    );
  }
  return (
    <li>
      <Link
        to="/owner/laporan/selisih-opname/$productId"
        params={{ productId: item.productId }}
        search={search}
        className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="break-words">{item.productName}</span>
          {item.repeated ? (
            <span className="flex items-center gap-1.5">
              <ToneBadge tone="warn" icon={Repeat}>
                Berulang
              </ToneBadge>
              <span className="text-[13px] text-muted tabular-nums">
                {`${shortCount} dari ${countTotal}`}
              </span>
            </span>
          ) : (
            detail.map((t) => (
              <span key={t} className="text-[13px] text-muted tabular-nums">
                {t}
              </span>
            ))
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end tabular-nums">
          {shortCount > 0 &&
            (item.lossValue === null ? (
              noCost
            ) : (
              <span className="font-semibold">
                {formatSignedRupiah(-item.lossValue)}
              </span>
            ))}
          {overCount > 0 &&
            (item.gainValue === null ? (
              noCost
            ) : (
              <span className="font-semibold">
                {formatSignedRupiah(item.gainValue)}
              </span>
            ))}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
}

/** Selisih opname (K19): kartu kotor dan urutan barang dari server; layar hanya menampilkan. */
export function OpnameReportPage() {
  const search = useSearch({ from: "/owner/laporan/selisih-opname" });
  const query = useGetOwnerOpnameReport({
    from: search.dari,
    to: search.sampai,
  });
  const r = query.data;
  return (
    <div className="grid gap-4">
      <SubPageHeader
        title="Selisih opname"
        eyebrow={rangeLabel({ from: search.dari, to: search.sampai })}
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <ReportState query={query}>
        {r && (
          <>
            <section
              aria-label="Ringkasan selisih"
              className="grid grid-cols-2 gap-3"
            >
              <StatCard
                label="Kurang"
                value={formatSignedRupiah(-r.lossValue)}
                note={`${r.lossCount} barang`}
              />
              <StatCard
                label="Lebih"
                value={formatSignedRupiah(r.gainValue)}
                note={`${r.gainCount} barang`}
              />
            </section>
            {r.items.length === 0 ? (
              <p className="rounded-lg bg-surface px-4 py-4 text-muted">
                Belum ada selisih opname di periode ini
              </p>
            ) : (
              <Section title="Per barang">
                <RowList>
                  {r.items.map((item) => (
                    <ItemRow key={item.productId} item={item} search={search} />
                  ))}
                </RowList>
              </Section>
            )}
            <div className="grid gap-1 px-1 text-[13px] text-muted">
              <p>Selisih yang sudah diberi alasan tetap dihitung.</p>
              {r.unknownValueCount > 0 && (
                <p>{`${r.unknownValueCount} hitungan belum ada HPP`}</p>
              )}
            </div>
          </>
        )}
      </ReportState>
    </div>
  );
}
