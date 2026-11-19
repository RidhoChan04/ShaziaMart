import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, QrCode } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerExceptionsQueryKey,
  useGetOwnerTodaySummary,
  useReviewOwnerExceptions,
} from "@/shared/api/gen/owner/owner";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../common/sub-page-header";
import { AttentionRow } from "../home/attention-list";
import { attentionItems } from "../home/home-model";
import { QrisReconcileSheet } from "./qris-reconcile-sheet";

const focusTitle = () =>
  document.querySelector<HTMLElement>("main h1")?.focus();

/** Daftar lengkap Perlu perhatian (S8): urutan sama dengan Beranda; kejadian ditinjau langsung, QRIS dicocokkan lewat lembar (S11). */
export function AttentionAllPage() {
  const client = useQueryClient();
  const { date } = useBusinessDay();
  const query = useGetOwnerTodaySummary({
    // Kunci sama dengan Beranda: ringkasan yang sudah dimuat dipakai ulang.
    query: { queryKey: [...getGetOwnerTodaySummaryQueryKey(), date] },
  });
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const cocokkanRef = useRef<HTMLButtonElement>(null);

  const refreshSummary = () =>
    client.invalidateQueries({ queryKey: getGetOwnerTodaySummaryQueryKey() });
  const review = useReviewOwnerExceptions({
    mutation: {
      onSuccess: async () => {
        void client.invalidateQueries({
          queryKey: getListOwnerExceptionsQueryKey(),
        });
        await refreshSummary();
        toast.success("Ditandai sudah ditinjau");
        // Tombolnya ikut hilang bersama butirnya: fokus pindah ke judul halaman.
        focusTitle();
      },
    },
  });

  const closeReconcile = async () => {
    setReconcileOpen(false);
    await refreshSummary();
    // Fokus kembali ke `Cocokkan`; bila butirnya sudah hilang, ke judul halaman.
    setTimeout(() => {
      const trigger = cocokkanRef.current;
      if (trigger?.isConnected) trigger.focus();
      else focusTitle();
    }, 0);
  };

  const items = query.data ? attentionItems(query.data.attention) : null;
  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title="Perlu perhatian"
        {...(items && items.length > 0
          ? { eyebrow: `${items.length} butir` }
          : {})}
        back={{ label: "Beranda", fallback: "/owner" }}
      />
      {!items ? (
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
        <div className="grid gap-3 lg:max-w-2xl">
          {review.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {pesanError(review.error)}
            </p>
          )}
          <ul className="overflow-hidden rounded-lg bg-surface">
            {items.length === 0 ? (
              <li className="flex min-h-14 items-center gap-3 px-4 py-2">
                <CircleCheck
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary"
                />
                Semua aman hari ini
              </li>
            ) : (
              items.map((item) => {
                const { review: target, reconcileQris } = item;
                return (
                  <AttentionRow
                    key={item.key}
                    item={item}
                    action={
                      target ? (
                        <Button
                          variant="outline"
                          className="h-11 px-4 text-[15px]"
                          disabled={review.isPending}
                          aria-label={`Tandai sudah ditinjau: ${item.title}`}
                          onClick={() =>
                            review.mutate({
                              data: {
                                kind: target.kind,
                                kasirId: target.kasirId,
                                upTo: target.upTo,
                              },
                            })
                          }
                        >
                          Tandai sudah ditinjau
                        </Button>
                      ) : reconcileQris ? (
                        <Button
                          ref={cocokkanRef}
                          variant="outline"
                          className="h-11 gap-1.5 px-4 text-[15px]"
                          onClick={() => setReconcileOpen(true)}
                        >
                          <QrCode aria-hidden="true" className="size-4" />
                          Cocokkan
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </ul>
        </div>
      )}
      <QrisReconcileSheet
        open={reconcileOpen}
        onClose={() => void closeReconcile()}
      />
    </div>
  );
}
