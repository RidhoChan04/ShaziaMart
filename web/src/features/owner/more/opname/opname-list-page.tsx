import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, OctagonAlert, TriangleAlert } from "lucide-react";
import { useListOwnerOpnameSessions } from "@/shared/api/gen/owner/owner";
import type { OwnerOpnameRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatDateLong, jakartaTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { scopeLabel } from "@/shared/lib/stock-rules";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList } from "../../products/detail/section";

const rowClass =
  "flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

const pill =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap";

function Flags({ row }: { row: OwnerOpnameRow }) {
  return (
    <>
      {row.heldCount > 0 && (
        <span className={`${pill} bg-warning-soft text-warning-ink`}>
          <Clock aria-hidden="true" className="size-3" />
          {`${row.heldCount} menunggu persetujuan`}
        </span>
      )}
      {row.flagged && !row.reviewed && (
        <span className={`${pill} bg-danger-soft text-danger-ink`}>
          <OctagonAlert aria-hidden="true" className="size-3" />
          Selisih besar
        </span>
      )}
      {row.status === "menunggu_alasan" && (
        <span className={`${pill} bg-warning-soft text-warning-ink`}>
          <TriangleAlert aria-hidden="true" className="size-3" />
          Belum diberi alasan
        </span>
      )}
    </>
  );
}

function SessionRow({ row }: { row: OwnerOpnameRow }) {
  return (
    <li>
      <Link
        to="/owner/lainnya/opname/$sessionId"
        params={{ sessionId: row.id }}
        className={rowClass}
      >
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-base font-semibold">
              {scopeLabel(row.scope)}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatRupiah(row.totalValue)}
            </span>
          </span>
          <span className="text-[13px] text-muted">
            {`${formatDateLong(row.submittedAt)} ${jakartaTime(row.submittedAt)} · ${row.createdByName}`}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 empty:hidden">
            <Flags row={row} />
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

/** Hasil opname (9a): sesi terbaru dulu, dengan tanda menunggu persetujuan, selisih besar, dan belum diberi alasan. */
export function OpnameListPage() {
  const query = useListOwnerOpnameSessions();
  const rows = query.data;
  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title="Hasil opname"
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      <div className="lg:max-w-2xl">
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
          <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
            Belum ada hasil opname
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface">
            <RowList>
              {rows.map((r) => (
                <SessionRow key={r.id} row={r} />
              ))}
            </RowList>
          </div>
        )}
      </div>
    </div>
  );
}
