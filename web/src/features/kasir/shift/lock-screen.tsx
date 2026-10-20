import { useQueryClient } from "@tanstack/react-query";
import { usePinLogin } from "@/shared/api/gen/auth/auth";
import type { Shift } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { GateCard } from "./gate-card";
import { setSession, syncGate } from "./gate-state";
import { PinPad } from "./pin-pad";

/** Shift terbuka tanpa sesi: hanya kasir shift yang bisa membuka dengan PIN. */
export function LockScreen({ shift }: { shift: Shift }) {
  const client = useQueryClient();
  const login = usePinLogin({
    mutation: {
      onSuccess: (session) => {
        setSession(client, session);
        syncGate(client);
      },
    },
  });
  return (
    <GateCard title="Layar terkunci">
      <p className="text-center text-lg font-semibold">{`Shift ${shift.kasirName}`}</p>
      <PinPad
        pending={login.isPending}
        error={login.isError ? pesanError(login.error) : null}
        onComplete={(pin) =>
          login.mutate({ data: { userId: shift.kasirId, pin } })
        }
      />
    </GateCard>
  );
}
