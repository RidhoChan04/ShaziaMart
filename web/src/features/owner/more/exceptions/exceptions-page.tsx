import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerExceptionsQueryKey,
  useListOwnerExceptions,
  useReviewOwnerExceptions,
} from "@/shared/api/gen/owner/owner";
import type {
  CashierException,
  ExceptionKind,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { relativeDayTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList } from "../../products/detail/section";
import {
  drawerNote,
  EXCEPTION_TITLE,
  exceptionRowTitle,
  isExceptionKind,
  newestAt,
  reviewedEyebrow,
  transferTask,
} from "./exceptions-model";

function ExceptionRow({
  exception: e,
  now,
}: {
  exception: CashierException;
  now: number;
}) {
  const drawer = drawerNote(e);
  const transfer = transferTask(e);
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-base break-words">
          {exceptionRowTitle(e)}
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">
          {formatRupiah(e.amount)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted">
        <span className="min-w-0 break-words">{e.reason}</span>
        <span className="shrink-0">{relativeDayTime(e.at, now)}</span>
      </div>
      {drawer && <p className="mt-1 text-[13px] text-muted">{drawer}</p>}
      {transfer && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[13px] font-semibold text-warning-ink">
          <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span className="min-w-0 break-words">{transfer}</span>
        </p>
      )}
    </li>
  );
}

function ExceptionsList({ kind }: { kind: ExceptionKind }) {
  const client = useQueryClient();
  const query = useListOwnerExceptions({ kind });
  const review = useReviewOwnerExceptions({
    mutation: {
      onSuccess: (saved) => {
        client.setQueryData(getListOwnerExceptionsQueryKey({ kind }), saved);
        // Butir Perlu perhatian di Beranda memakai ringkasan hari ini.
        void client.invalidateQueries({
          queryKey: getGetOwnerTodaySummaryQueryKey(),
        });
        toast.success("Ditandai sudah ditinjau");
      },
    },
  });
  const list = query.data;
  const items = list?.items ?? [];
  const now = Date.now();

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={EXCEPTION_TITLE[kind]}
        {...(list ? { eyebrow: reviewedEyebrow(list.reviewedAt) } : {})}
        back={{ label: "Beranda", fallback: "/owner" }}
      />
      {!list ? (
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
      ) : (
        <div className="grid gap-4 lg:max-w-2xl">
          {items.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
              Tidak ada yang perlu ditinjau
            </p>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg bg-surface">
                <RowList>
                  {items.map((e) => (
                    <ExceptionRow key={e.id} exception={e} now={now} />
                  ))}
                </RowList>
              </div>
              {review.isError && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {pesanError(review.error)}
                </p>
              )}
              <Button
                className="h-12 w-full text-[17px]"
                disabled={review.isPending}
                onClick={() =>
                  // Batas = kejadian terbaru yang tampil, bukan jam klik: yang masuk sesudah daftar dimuat tetap belum ditinjau.
                  review.mutate({ data: { kind, upTo: newestAt(items) } })
                }
              >
                Tandai sudah ditinjau
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid justify-items-start gap-4 pt-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em]">
        Halaman tidak ditemukan
      </h1>
      <Link
        to="/owner"
        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Kembali ke Beranda
      </Link>
    </div>
  );
}

/** Tinjau pengecualian kasir (ruling R9): kejadian sejak terakhir ditinjau, lalu `Tandai sudah ditinjau`. */
export function ExceptionsPage() {
  const { kind } = useParams({ from: "/owner/pengecualian/$kind" });
  return isExceptionKind(kind) ? <ExceptionsList kind={kind} /> : <NotFound />;
}
