import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearch } from "@tanstack/react-router";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerExceptionsQueryKey,
  useGetOwnerShift,
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
  isShiftEventKind,
  newestAt,
  reviewedEyebrow,
  shiftEventValue,
  shiftSpanText,
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
      {e.overLimitExcess !== null && (
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning-ink">
          <TriangleAlert aria-hidden="true" className="size-3" />
          {`Lewat limit ${formatRupiah(e.overLimitExcess)}`}
        </span>
      )}
      {transfer && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-[13px] font-semibold text-warning-ink">
          <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span className="min-w-0 break-words">{transfer}</span>
        </p>
      )}
    </li>
  );
}

/** Baris kejadian F3c-2a: `{kasir}` kanan nilai; bawah `{alasan}` atau rentang shift + jam kejadian. Bisa diketuk bila membawa shift. */
function ShiftEventRow({
  exception: e,
  now,
}: {
  exception: CashierException;
  now: number;
}) {
  const needSpan = e.reason === null && e.shiftId !== null;
  const shift = useGetOwnerShift(e.shiftId ?? "", {
    query: { enabled: needSpan },
  });
  const span = shift.data
    ? shiftSpanText(shift.data.openedAt, shift.data.closedAt)
    : "Shift";
  const detail =
    e.reason ??
    (e.kind === "kas_keluar" ? `Total kas keluar ${span.toLowerCase()}` : span);
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-base break-words">{e.kasirName}</span>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums">
            {shiftEventValue(e)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted">
          <span className="min-w-0 break-words">{detail}</span>
          <span className="shrink-0">{relativeDayTime(e.at, now)}</span>
        </div>
      </div>
    </>
  );
  return (
    <li>
      {e.shiftId ? (
        <Link
          to="/owner/lainnya/shift/$shiftId"
          params={{ shiftId: e.shiftId }}
          className="flex min-h-11 items-center gap-2 px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {body}
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted"
          />
        </Link>
      ) : (
        <div className="flex px-4 py-3">{body}</div>
      )}
    </li>
  );
}

function ExceptionsList({
  kind,
  kasirId,
}: {
  kind: ExceptionKind;
  kasirId?: string;
}) {
  const client = useQueryClient();
  const params = kasirId ? { kind, kasirId } : { kind };
  const query = useListOwnerExceptions(params);
  const review = useReviewOwnerExceptions({
    mutation: {
      onSuccess: (saved) => {
        client.setQueryData(getListOwnerExceptionsQueryKey(params), saved);
        // Butir Perlu perhatian di Beranda memakai ringkasan hari ini.
        void client.invalidateQueries({
          queryKey: getGetOwnerTodaySummaryQueryKey(),
        });
        toast.success("Ditandai sudah ditinjau");
        // Tombol hilang bersama daftarnya: fokus pindah ke judul halaman.
        document.querySelector<HTMLElement>("main h1")?.focus();
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
                  {items.map((e) =>
                    isShiftEventKind(e.kind) ? (
                      <ShiftEventRow key={e.id} exception={e} now={now} />
                    ) : (
                      <ExceptionRow key={e.id} exception={e} now={now} />
                    ),
                  )}
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
                  review.mutate({
                    data: { ...params, upTo: newestAt(items) },
                  })
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
  const { kasirId } = useSearch({ from: "/owner/pengecualian/$kind" });
  if (!isExceptionKind(kind)) return <NotFound />;
  // Selisih kecil ditinjau per kasir: tanpa kasirId tidak ada yang bisa ditampilkan.
  if (kind === "selisih_kecil" && !kasirId)
    return <Navigate to="/owner" replace />;
  return <ExceptionsList kind={kind} {...(kasirId ? { kasirId } : {})} />;
}
