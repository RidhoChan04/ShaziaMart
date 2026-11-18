import { useParams, useSearch } from "@tanstack/react-router";
import { useGetOwnerOpnameProductReport } from "@/shared/api/gen/owner/owner";
import type { OpnameCountRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  formatIsoDayMonth,
  jakartaIsoDate,
  jakartaTime,
} from "@/shared/lib/business-day";
import { formatSignedRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import { rangeLabel, weekdayLabel } from "@/shared/lib/report-period";
import { OPNAME_REASON_LABEL } from "@/shared/lib/stock-rules";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList, Section } from "../products/detail/section";
import { DutyLine } from "./duty-line";
import { ReportState, StatCard } from "./report-bits";

/** `Rab, 4 Nov · 10.05` */
function countedLabel(ms: number): string {
  const iso = jakartaIsoDate(ms);
  const day = weekdayLabel(iso);
  return `${day.slice(0, 3)}, ${formatIsoDayMonth(iso)} · ${jakartaTime(ms)}`;
}

function CountRow({
  row,
  unitSize,
  unitName,
}: {
  row: OpnameCountRow;
  unitSize: number;
  unitName: string;
}) {
  const diff = row.diffQtyBase;
  const qty = `${diff > 0 ? "+" : ""}${formatQty(diff, unitSize, unitName)}`;
  const reason = row.reason ? ` · ${OPNAME_REASON_LABEL[row.reason]}` : "";
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">{countedLabel(row.countedAt)}</span>
        {diff !== 0 && (
          <span className="shrink-0 tabular-nums">
            {row.value === null ? (
              <span className="text-[13px] text-muted">HPP belum ada</span>
            ) : (
              <span className="font-semibold">
                {formatSignedRupiah(diff < 0 ? -row.value : row.value)}
              </span>
            )}
          </span>
        )}
      </div>
      <p className="text-[13px] text-muted tabular-nums">
        {diff === 0
          ? `Cocok · dihitung ${row.counterName}`
          : `${qty} · dihitung ${row.counterName}${reason}`}
      </p>
      {diff < 0 && (
        <DutyLine prevCountedAt={row.previousCountedAt} duty={row.duty} />
      )}
    </li>
  );
}

/** Detail selisih satu barang (K20): bertugas saat kurang dan hitungan terbaru dulu, urutan dari server. */
export function OpnameProductPage() {
  const { productId } = useParams({
    from: "/owner/laporan/selisih-opname/$productId",
  });
  const search = useSearch({
    from: "/owner/laporan/selisih-opname/$productId",
  });
  const query = useGetOwnerOpnameProductReport(productId, {
    from: search.dari,
    to: search.sampai,
  });
  const r = query.data;
  return (
    <div className="grid gap-4">
      <SubPageHeader
        title={r?.productName ?? "Selisih per barang"}
        eyebrow={rangeLabel({ from: search.dari, to: search.sampai })}
        back={{
          label: "Selisih opname",
          fallback: "/owner/laporan/selisih-opname",
        }}
      />
      <ReportState query={query}>
        {r && (
          <>
            <section aria-label="Ringkasan selisih">
              {r.shortCount === 0 && r.overCount > 0 ? (
                <StatCard
                  label="Lebih"
                  value={
                    r.gainValue === null
                      ? "HPP belum ada"
                      : formatSignedRupiah(r.gainValue)
                  }
                  note={`+${formatQty(r.overQtyBase, r.unitSize, r.unitName)} · lebih di ${r.overCount} dari ${r.countTotal} hitungan`}
                />
              ) : (
                <StatCard
                  label="Kurang"
                  value={
                    r.lossValue === null
                      ? "HPP belum ada"
                      : formatSignedRupiah(-r.lossValue)
                  }
                  note={
                    r.shortCount === 0
                      ? `Cocok di ${r.countTotal} hitungan`
                      : `−${formatQty(r.shortQtyBase, r.unitSize, r.unitName)} · kurang di ${r.shortCount} dari ${r.countTotal} hitungan`
                  }
                />
              )}
            </section>
            {r.dutyOnShort.length > 0 && (
              <Section title="Bertugas saat kurang">
                <RowList>
                  {r.dutyOnShort.map((d) => (
                    <li
                      key={d.name}
                      className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
                    >
                      <span className="min-w-0 break-words">{d.name}</span>
                      <span className="shrink-0 text-muted tabular-nums">
                        {`${d.intervals} dari ${r.shortCount}`}
                      </span>
                    </li>
                  ))}
                </RowList>
                <p className="px-4 py-3 text-[13px] text-muted">
                  Petunjuk, bukan bukti — cocokkan dengan CCTV atau catatan
                  laci.
                </p>
              </Section>
            )}
            <Section title="Hitungan">
              <RowList>
                {r.counts.map((row) => (
                  <CountRow
                    key={`${row.sessionId}-${row.countedAt}`}
                    row={row}
                    unitSize={r.unitSize}
                    unitName={r.unitName}
                  />
                ))}
              </RowList>
            </Section>
          </>
        )}
      </ReportState>
    </div>
  );
}
