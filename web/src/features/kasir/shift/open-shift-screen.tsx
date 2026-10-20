import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useListKasirUsers, usePinLogin } from "@/shared/api/gen/auth/auth";
import type { User } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useOpenShift } from "@/shared/api/gen/shift/shift";
import { pesanError } from "@/shared/lib/error-messages";
import { parseRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { MoneyField } from "../payment/tunai-tab";
import { GateCard } from "./gate-card";
import { setSession, setShift, syncGate } from "./gate-state";
import { PinPad } from "./pin-pad";

type Step = { kind: "kasir" } | { kind: "pin" | "modal"; kasir: User };

/** Belum ada shift: pilih kasir → PIN → modal awal laci → buka shift. */
export function OpenShiftScreen() {
  const [step, setStep] = useState<Step>({ kind: "kasir" });

  return (
    <GateCard title="Buka shift">
      {step.kind === "kasir" ? (
        <KasirPicker onPick={(kasir) => setStep({ kind: "pin", kasir })} />
      ) : (
        <>
          <p className="text-center text-lg font-semibold">
            {`${step.kind === "pin" ? "PIN untuk" : "Kasir"} ${step.kasir.name}`}
          </p>
          {step.kind === "pin" ? (
            <LoginStep
              kasir={step.kasir}
              onDone={() => setStep({ kind: "modal", kasir: step.kasir })}
            />
          ) : (
            <OpeningCashStep />
          )}
          <Button
            variant="ghost"
            className="justify-self-center"
            onClick={() => setStep({ kind: "kasir" })}
          >
            Ganti kasir
          </Button>
        </>
      )}
    </GateCard>
  );
}

function KasirPicker({ onPick }: { onPick: (kasir: User) => void }) {
  const users = useListKasirUsers();
  if (users.isError) {
    return <p className="text-center text-danger">{pesanError(users.error)}</p>;
  }
  if (!users.data) return <p className="text-center text-muted">Memuat…</p>;
  return (
    <div className="grid gap-2">
      <p className="text-center text-muted">Pilih kasir</p>
      {users.data.map((u) => (
        <Button
          key={u.id}
          size="lg"
          variant="outline"
          onClick={() => onPick(u)}
        >
          {u.name}
        </Button>
      ))}
    </div>
  );
}

function LoginStep({ kasir, onDone }: { kasir: User; onDone: () => void }) {
  const client = useQueryClient();
  const login = usePinLogin({
    mutation: {
      onSuccess: (session) => {
        setSession(client, session);
        syncGate(client);
        onDone();
      },
    },
  });
  return (
    <PinPad
      pending={login.isPending}
      error={login.isError ? pesanError(login.error) : null}
      onComplete={(pin) => login.mutate({ data: { userId: kasir.id, pin } })}
    />
  );
}

function OpeningCashStep() {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const openingCash = parseRupiah(text);
  const open = useOpenShift({
    mutation: {
      onSuccess: (shift) => setShift(client, shift),
      onSettled: () => syncGate(client),
    },
  });
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (openingCash === null || open.isPending) return;
        open.mutate({ data: { openingCash } });
      }}
    >
      <MoneyField label="Modal awal di laci" value={text} onChange={setText} />
      {open.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(open.error)}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={openingCash === null || open.isPending}
        aria-busy={open.isPending}
      >
        Buka shift
      </Button>
    </form>
  );
}
