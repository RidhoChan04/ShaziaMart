import { ClipboardX, OctagonAlert } from "lucide-react";
import type { OwnerOpnameSession } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { relativeDayTime } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";

const REPLACED_HELD = "Opname tertahan diganti hitungan baru";

/** Barang yang ditahan lalu diganti hitungan baru: tetap terlihat sampai sesinya ditinjau (I2). */
export const hasReplacedHeld = (session: OwnerOpnameSession): boolean =>
  session.items.some((i) => i.replacedByName !== null);

/** Tanda sesi yang perlu ditinjau: selisih besar dan/atau tertahan yang diganti; lalu `Tandai sudah ditinjau`. */
export function ReviewBanner({
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
      aria-label={session.flagged ? "Selisih besar" : REPLACED_HELD}
      className="grid gap-3 rounded-lg bg-danger-soft p-4 text-danger-ink"
    >
      {session.flagged && (
        <p className="flex items-start gap-2 font-semibold">
          <OctagonAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {`Total selisih ${formatRupiah(session.totalValue)} melewati batas ${formatRupiah(session.sessionLimit)}`}
        </p>
      )}
      {hasReplacedHeld(session) && (
        <p className="flex items-start gap-2 font-semibold">
          <ClipboardX aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {REPLACED_HELD}
        </p>
      )}
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
