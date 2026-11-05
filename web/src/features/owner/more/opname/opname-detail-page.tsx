import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { OctagonAlert } from "lucide-react";
import { useState } from "react";
import {
  getGetOwnerOpnameSessionQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerOpnameSessionsQueryKey,
  useApproveOpnameItem,
  useGetOwnerOpnameSession,
  useRecountOpnameItem,
  useReviewOpnameSession,
} from "@/shared/api/gen/owner/owner";
import type {
  OwnerOpnameItem,
  OwnerOpnameSession,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  formatDateLong,
  jakartaTime,
  relativeDayTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { scopeLabel } from "@/shared/lib/stock-rules";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList, Section } from "../../products/detail/section";
import { ApproveDialog } from "./approve-dialog";
import { OpnameItemRow } from "./opname-item-row";
import {
  effectiveCount,
  groupItems,
  OPNAME_SESSION_LIMIT,
} from "./opname-model";
import { RecountSheet } from "./recount-sheet";

function Summary({ session }: { session: OwnerOpnameSession }) {
  const counted = session.items.filter((i) => i.state !== "diganti");
  const diffs = counted.filter(
    (i) => effectiveCount(i).diffQtyBase !== 0 && i.state !== "stok_awal",
  );
  return (
    <section
      aria-label="Ringkasan selisih"
      className="rounded-lg bg-surface p-4"
    >
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[13px] font-semibold text-muted">Kurang</dt>
          <dd className="text-[22px] font-bold tabular-nums">
            {formatRupiah(session.lossValue)}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-muted">Lebih</dt>
          <dd className="text-[22px] font-bold tabular-nums">
            {formatRupiah(session.gainValue)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-[13px] text-muted">
        {`${counted.length} barang dihitung · ${diffs.length} selisih`}
      </p>
    </section>
  );
}

function FlagBanner({
  session,
  pending,
  onReview,
}: {
  session: OwnerOpnameSession;
  pending: boolean;
  onReview: () => void;
}) {
  return (
    <section
      aria-label="Selisih besar"
      className="grid gap-3 rounded-lg bg-danger-soft p-4 text-danger-ink"
    >
      <p className="flex items-start gap-2 font-semibold">
        <OctagonAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {`Total selisih ${formatRupiah(session.totalValue)} melewati batas ${formatRupiah(OPNAME_SESSION_LIMIT)}`}
      </p>
      {session.reviewedAt !== null ? (
        <p className="text-[15px] font-semibold">
          {`Ditinjau ${session.reviewedByName ?? "pemilik"} · ${relativeDayTime(session.reviewedAt, Date.now())}`}
        </p>
      ) : (
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={pending}
          onClick={onReview}
        >
          Tandai sudah ditinjau
        </Button>
      )}
    </section>
  );
}

/** Detail sesi opname (9b): ringkasan nilai, tanda selisih besar, lalu barang per bagian; selisih yang ditahan bisa disetujui atau dihitung ulang. */
export function OpnameDetailPage() {
  const { sessionId } = useParams({ from: "/owner/lainnya/opname/$sessionId" });
  const client = useQueryClient();
  const query = useGetOwnerOpnameSession(sessionId);
  const [approving, setApproving] = useState<OwnerOpnameItem | null>(null);
  const [recounting, setRecounting] = useState<OwnerOpnameItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const detailKey = getGetOwnerOpnameSessionQueryKey(sessionId);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: getListOwnerOpnameSessionsQueryKey(),
      }),
      client.invalidateQueries({ queryKey: getGetOwnerTodaySummaryQueryKey() }),
    ]);
  const mutationOptions = {
    onSuccess: async (session: OwnerOpnameSession) => {
      client.setQueryData(detailKey, session);
      setActionError(null);
      setApproving(null);
      setRecounting(null);
      await refresh();
    },
    // 409 OPNAME_NOT_HELD dan galat lain: tutup lembar, tampilkan pesan, muat ulang agar tampilan sama dengan server.
    onError: (error: unknown) => {
      setActionError(pesanError(error));
      setApproving(null);
      setRecounting(null);
      void client.invalidateQueries({ queryKey: detailKey });
      void refresh();
    },
  };
  const approve = useApproveOpnameItem({ mutation: mutationOptions });
  const recount = useRecountOpnameItem({ mutation: mutationOptions });
  const review = useReviewOpnameSession({ mutation: mutationOptions });
  const busy = approve.isPending || recount.isPending || review.isPending;

  const session = query.data;
  const header = (
    <SubPageHeader
      title={session ? scopeLabel(session.scope) : "Hasil opname"}
      {...(session && {
        eyebrow: `${session.createdByName} · ${formatDateLong(session.submittedAt)} ${jakartaTime(session.submittedAt)}`,
      })}
      back={{ label: "Hasil opname", fallback: "/owner/lainnya/opname" }}
    />
  );

  if (!session) {
    return (
      <div>
        {header}
        {query.isError ? (
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
        )}
      </div>
    );
  }

  const now = Date.now();
  return (
    <div className="pb-24 lg:pb-8">
      {header}
      <div className="grid gap-5 lg:max-w-2xl">
        <Summary session={session} />
        {session.flagged && (
          <FlagBanner
            session={session}
            pending={busy}
            onReview={() => {
              setActionError(null);
              review.mutate({ sessionId });
            }}
          />
        )}
        {actionError !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {actionError}
          </p>
        )}
        {groupItems(session.items).map((g) => (
          <Section key={g.title} title={g.title}>
            <RowList>
              {g.items.map((item) => (
                <OpnameItemRow
                  key={item.productId}
                  item={item}
                  now={now}
                  busy={busy}
                  onApprove={setApproving}
                  onRecount={setRecounting}
                />
              ))}
            </RowList>
          </Section>
        ))}
      </div>
      <ApproveDialog
        item={approving}
        pending={approve.isPending}
        onClose={() => setApproving(null)}
        onApprove={(item) => {
          setActionError(null);
          approve.mutate({ sessionId, productId: item.productId });
        }}
      />
      <RecountSheet
        item={recounting}
        pending={recount.isPending}
        onClose={() => setRecounting(null)}
        onSave={(item, qtyBase) => {
          setActionError(null);
          recount.mutate({
            sessionId,
            productId: item.productId,
            data: { qtyBase },
          });
        }}
      />
    </div>
  );
}
