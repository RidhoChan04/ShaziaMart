import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useListStaffReceipts } from "@/shared/api/gen/staff/staff";
import { pesanError } from "@/shared/lib/error-messages";
import { buttonVariants } from "@/shared/ui/button";
import { useStaffSession } from "../auth/staff-session";
import type { ReceiptDraft } from "../drafts/draft-types";
import { useStaffSync } from "../drafts/sync-context";
import { useDrafts } from "../drafts/use-drafts";
import { DraftStorageBanner } from "./draft-banner";
import { Card, SectionHeading } from "./form-ui";
import { DraftRow, ReceiptRow } from "./receipt-row";

/** Tab Masuk: draf di HP (belum terkirim, ditolak, sedang diisi) lalu nota yang sudah terkirim. */
export function MasukPage() {
  const userId = useStaffSession().data?.user.id ?? "";
  const navigate = useNavigate();
  const { drafts, storageError } = useDrafts(userId);
  // Draf antre dikirim otomatis di sini juga (tab ditutup lalu dibuka lagi).
  const sync = useStaffSync();
  const receipts = useListStaffReceipts();
  const unsent = drafts.filter((d) => d.status !== "editing");
  const editing = drafts.filter((d) => d.status === "editing");
  const sent = receipts.data ?? [];
  const empty =
    drafts.length === 0 && receipts.isSuccess && receipts.data.length === 0;

  const openDraft = (d: ReceiptDraft) =>
    navigate({ to: "/staff/masuk/baru", search: { draf: d.id } });
  const draftRows = (list: ReceiptDraft[]) => (
    <Card>
      {list.map((d) => (
        <DraftRow key={d.id} draft={d} onOpen={() => void openDraft(d)} />
      ))}
    </Card>
  );

  return (
    <div className="max-w-xl">
      <Link
        to="/staff/masuk/baru"
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        <Plus aria-hidden="true" />
        Catat barang masuk
      </Link>
      {(storageError || sync.storageError) && <DraftStorageBanner />}
      {unsent.length > 0 && (
        <>
          <SectionHeading>Belum terkirim</SectionHeading>
          {draftRows(unsent)}
        </>
      )}
      {editing.length > 0 && (
        <>
          <SectionHeading>Draf</SectionHeading>
          {draftRows(editing)}
        </>
      )}
      {sent.length > 0 && (
        <>
          <SectionHeading>Terkirim</SectionHeading>
          <Card>
            {sent.map((r) => (
              <ReceiptRow
                key={r.id}
                supplierName={r.supplierName}
                notaDate={r.notaDate}
                lineCount={r.lineCount}
                total={r.total}
                mark={r.status === "dibatalkan" ? "dibatalkan" : undefined}
                onOpen={() =>
                  void navigate({
                    to: "/staff/masuk/$receiptId",
                    params: { receiptId: r.id },
                  })
                }
              />
            ))}
          </Card>
        </>
      )}
      {receipts.isError && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {pesanError(receipts.error)}
        </p>
      )}
      {empty && <p className="mt-6 text-muted">Belum ada barang masuk</p>}
    </div>
  );
}
