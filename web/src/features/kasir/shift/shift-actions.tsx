import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useLogout } from "@/shared/api/gen/auth/auth";
import type {
  Session,
  Shift,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { Button } from "@/shared/ui/button";
import { useCart } from "../cart/cart-store";
import { focusScanBox } from "../scan/scan-box";
import { CloseShiftDialog } from "./close-shift-dialog";
import { setSession, syncGate } from "./gate-state";
import { useIdleLock } from "./use-idle-lock";

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

/** `Rina · Shift 08.00` di header. */
export function ShiftInfo({
  session,
  shift,
}: {
  session: Session;
  shift: Shift;
}) {
  return (
    <span className="font-medium tabular-nums">
      {`${session.user.name} · Shift ${timeFormat.format(shift.openedAt)}`}
    </span>
  );
}

/** Tombol header saat shift terbuka: Riwayat, Kunci (juga otomatis saat idle), Tutup shift. */
export function ShiftActions({
  onClosed,
}: {
  onClosed: (closure: ShiftClosure) => void;
}) {
  const client = useQueryClient();
  const hasLines = useCart((s) => s.lines.length > 0);
  const [closing, setClosing] = useState(false);
  // Kunci tetap berlaku di layar walau server tidak menjawab.
  const logout = useLogout({
    mutation: {
      onSettled: () => {
        setSession(client, null);
        syncGate(client);
      },
    },
  });
  const lock = () => {
    if (!logout.isPending) logout.mutate();
  };
  useIdleLock(lock);

  return (
    <>
      {/* Diisi di Task 13. */}
      <Button variant="outline" disabled>
        Riwayat
      </Button>
      <Button variant="outline" onClick={lock} disabled={logout.isPending}>
        Kunci
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          if (hasLines) {
            toast.warning("Keranjang masih berisi — tahan atau kosongkan dulu");
            focusScanBox();
          } else {
            setClosing(true);
          }
        }}
      >
        Tutup shift
      </Button>
      <CloseShiftDialog
        open={closing}
        onClose={() => setClosing(false)}
        onClosed={(closure) => {
          setClosing(false);
          onClosed(closure);
        }}
      />
    </>
  );
}
