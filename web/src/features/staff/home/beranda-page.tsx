import { Link, useNavigate } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { useStaffSession } from "../auth/staff-session";
import { useStaffSync } from "../drafts/sync-context";
import { useDrafts } from "../drafts/use-drafts";
import { DraftStorageBanner } from "../receipt/draft-banner";
import { Card, SectionHeading } from "../receipt/form-ui";
import { DraftRow } from "../receipt/receipt-row";

/** Beranda orang toko: tugas utama sebagai kartu besar, lalu draf yang belum terkirim (kedaluwarsa & menipis menyusul di F3b-2b). */
export function StaffBerandaPage() {
  const userId = useStaffSession().data?.user.id ?? "";
  const navigate = useNavigate();
  const { drafts, storageError } = useDrafts(userId);
  const sync = useStaffSync();
  const unsent = drafts.filter((d) => d.status !== "editing");
  return (
    <div className="max-w-md">
      <Link
        to="/staff/masuk/baru"
        className="flex min-h-28 flex-col justify-between gap-3 rounded-lg bg-linear-155 from-primary to-primary-deep p-4 text-primary-foreground shadow-sm transition-transform duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-md bg-primary-foreground/20"
        >
          <Truck className="size-5" />
        </span>
        <span>
          <span className="block text-[17px] font-bold tracking-[-0.015em]">
            Barang masuk
          </span>
          <span className="text-[13px]">Catat nota supplier</span>
        </span>
      </Link>
      {(storageError || sync.storageError) && <DraftStorageBanner />}
      {unsent.length > 0 && (
        <>
          <SectionHeading>{`Belum terkirim (${unsent.length})`}</SectionHeading>
          <Card>
            {unsent.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                onOpen={() =>
                  void navigate({
                    to: "/staff/masuk/baru",
                    search: { draf: d.id },
                  })
                }
              />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
