import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ApiError } from "@/shared/api/fetcher";
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
import { formatDateLong, jakartaTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { scopeLabel } from "@/shared/lib/stock-rules";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList, Section } from "../../products/detail/section";
import { ApproveDialog } from "./approve-dialog";
import { OpnameItemRow } from "./opname-item-row";
import { effectiveCount, groupItems } from "./opname-model";
import { RecountSheet } from "./recount-sheet";
import { hasReplacedHeld, ReviewBanner } from "./review-banner";

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

/** Detail sesi opname (9b): ringkasan nilai, tanda selisih besar, lalu barang per bagian; selisih yang ditahan bisa disetujui atau dihitung ulang. */
export function OpnameDetailPage() {
  const { sessionId } = useParams({ from: "/owner/lainnya/opname/$sessionId" });
  const client = useQueryClient();
  const query = useGetOwnerOpnameSession(sessionId);
  const [approving, setApproving] = useState<OwnerOpnameItem | null>(null);
  const [recounting, setRecounting] = useState<OwnerOpnameItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const detailKey = getGetOwnerOpnameSessionQueryKey(sessionId);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: getListOwnerOpnameSessionsQueryKey(),
      }),
      client.invalidateQueries({ queryKey: getGetOwnerTodaySummaryQueryKey() }),
    ]);
  // Tombol pemicu hilang setelah sukses (baris pindah bagian): fokus ke judul halaman, bukan body.
  // Dibatalkan (Kembali/Batal/Esc): fokus kembali ke tombol pembukanya (dialog tanpa Trigger Radix).
  const focusTitleOnClose = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const focusTitle = () =>
    document.querySelector<HTMLElement>("main h1")?.focus();
  const closeSheets = () => {
    focusTitleOnClose.current = true;
    setApproving(null);
    setRecounting(null);
  };
  const keepFocus = (e: Event) => {
    e.preventDefault();
    if (focusTitleOnClose.current || !opener.current?.isConnected) {
      focusTitleOnClose.current = false;
      focusTitle();
    } else opener.current.focus();
  };
  const mutationOptions = {
    onSuccess: async (session: OwnerOpnameSession) => {
      client.setQueryData(detailKey, session);
      setActionError(null);
      setDialogError(null);
      closeSheets();
      await refresh();
    },
    // 409 OPNAME_NOT_HELD: tutup lembar, tampilkan pesan, muat ulang. Galat lain: lembar tetap terbuka dengan pesannya agar hitungan tidak hilang.
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.code === "OPNAME_NOT_HELD") {
        setActionError(pesanError(error));
        setDialogError(null);
        closeSheets();
        void client.invalidateQueries({ queryKey: detailKey });
        void refresh();
      } else {
        setDialogError(pesanError(error));
      }
    },
  };
  const approve = useApproveOpnameItem({ mutation: mutationOptions });
  const recount = useRecountOpnameItem({ mutation: mutationOptions });
  const review = useReviewOpnameSession({
    mutation: {
      onSuccess: async (session: OwnerOpnameSession) => {
        client.setQueryData(detailKey, session);
        setActionError(null);
        focusTitle();
        await refresh();
      },
      onError: (error: unknown) => setActionError(pesanError(error)),
    },
  });
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
        {(session.flagged || hasReplacedHeld(session)) && (
          <ReviewBanner
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
                  onApprove={(i, button) => {
                    opener.current = button;
                    setDialogError(null);
                    setApproving(i);
                  }}
                  onRecount={(i, button) => {
                    opener.current = button;
                    setDialogError(null);
                    setRecounting(i);
                  }}
                />
              ))}
            </RowList>
          </Section>
        ))}
      </div>
      <ApproveDialog
        item={approving}
        pending={approve.isPending}
        error={dialogError}
        onCloseAutoFocus={keepFocus}
        onClose={() => {
          setDialogError(null);
          setApproving(null);
        }}
        onApprove={(item) => {
          setActionError(null);
          approve.mutate({ sessionId, productId: item.productId });
        }}
      />
      <RecountSheet
        item={recounting}
        pending={recount.isPending}
        error={dialogError}
        onCloseAutoFocus={keepFocus}
        onClose={() => {
          setDialogError(null);
          setRecounting(null);
        }}
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
