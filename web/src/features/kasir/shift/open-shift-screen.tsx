import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";
import { ApiError } from "@/shared/api/fetcher";
import { useListKasirUsers, usePinLogin } from "@/shared/api/gen/auth/auth";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import type {
  OpeningSuggestion,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  useGetOpeningSuggestion,
  useOpenShift,
} from "@/shared/api/gen/shift/shift";
import { PinPad } from "@/shared/components/pin-pad";
import { SCAN_GAP_MS, useScanGuard } from "@/shared/hooks/use-scan-guard";
import { pesanError } from "@/shared/lib/error-messages";
import { formatAngka, formatRupiah, parseRupiah } from "@/shared/lib/money";
import { REASON_MAX } from "@/shared/lib/reason-rules";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { OwnerPhoneLine } from "../common/owner-phone-line";
import { ScannedAlert } from "../common/scanned-alert";
import { MoneyField } from "../payment/tunai-tab";
import { GateCard } from "./gate-card";
import { setSession, setShift, syncGate } from "./gate-state";

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

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
});
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});
const DAY_MS = 86_400_000;

/** `pukul 22.04` (hari ini) · `kemarin pukul 22.04` · `19 Nov pukul 22.04`. */
function closedWhen(closedAt: number, now: number): string {
  const jam = timeFormat.format(closedAt).replace(":", ".");
  const day = dayFormat.format(closedAt);
  if (day === dayFormat.format(now)) return `pukul ${jam}`;
  if (day === dayFormat.format(now - DAY_MS)) return `kemarin pukul ${jam}`;
  return `${dateFormat.format(closedAt)} pukul ${jam}`;
}

/** Modal awal laci terisi dari saran server; saran dimuat segar tiap langkah ini dibuka. */
function OpeningCashStep() {
  const suggestion = useGetOpeningSuggestion({
    query: { gcTime: 0, staleTime: 0, refetchOnMount: "always" },
  });
  if (suggestion.isPending) {
    return <p className="text-center text-muted">Memuat…</p>;
  }
  // Saran gagal dimuat: lanjut tanpa saran; server tetap memeriksa saat buka shift.
  return (
    <OpeningCashForm
      suggestion={suggestion.data ?? null}
      refetchSuggestion={() => void suggestion.refetch()}
    />
  );
}

/** Keterangan di bawah isian modal: hitungan tutup shift sebelumnya dan selisih dari saran. */
function SuggestionNotes({
  suggestion,
  diff,
}: {
  suggestion: OpeningSuggestion | null;
  diff: number;
}) {
  return (
    <>
      {suggestion?.lastKasirName != null &&
        suggestion.lastClosedAt != null &&
        suggestion.lastCountedCash != null && (
          <>
            <p className="text-sm text-muted tabular-nums">
              {`Hitungan tutup shift ${suggestion.lastKasirName} ${closedWhen(suggestion.lastClosedAt, Date.now())}: ${formatRupiah(suggestion.lastCountedCash)}`}
            </p>
            {suggestion.ownerTakes > 0 && (
              <p className="text-sm text-muted tabular-nums">
                {`Diambil pemilik setelahnya: -${formatRupiah(suggestion.ownerTakes)}`}
              </p>
            )}
          </>
        )}
      {diff !== 0 && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-ink tabular-nums">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {`${diff < 0 ? "Kurang" : "Lebih"} ${formatRupiah(Math.abs(diff))} dari hitungan sebelumnya`}
        </p>
      )}
    </>
  );
}

function OpeningCashForm({
  suggestion,
  refetchSuggestion,
}: {
  suggestion: OpeningSuggestion | null;
  refetchSuggestion: () => void;
}) {
  const client = useQueryClient();
  const reasonId = useId();
  const [text, setText] = useState(
    suggestion?.suggestedCash == null
      ? ""
      : formatAngka(suggestion.suggestedCash),
  );
  const [reason, setReason] = useState("");
  // Saran dari 422 dipakai sampai muat ulang saran selesai.
  const [mismatch, setMismatch] = useState<number | null>(null);
  const guard = useScanGuard(setReason);
  const lastDigitAt = useRef(Number.NEGATIVE_INFINITY);
  const settings = useGetKasirSettings({
    query: { refetchOnMount: "always" },
  }).data;
  const openingCash = parseRupiah(text);
  const suggested = mismatch ?? suggestion?.suggestedCash ?? null;
  const diff =
    suggested !== null && openingCash !== null ? openingCash - suggested : 0;
  const differs = suggested !== null && openingCash !== suggested;
  const note = reason.trim();
  const open = useOpenShift({
    mutation: {
      onSuccess: (shift) => setShift(client, shift),
      onError: (error) => {
        if (error instanceof ApiError && error.code === "OPENING_MISMATCH") {
          const body = error.body as { suggestedCash?: unknown } | undefined;
          if (typeof body?.suggestedCash === "number") {
            setMismatch(body.suggestedCash);
          }
          refetchSuggestion();
        }
      },
      onSettled: () => syncGate(client),
    },
  });
  const ready =
    openingCash !== null && !open.isPending && (!differs || note !== "");
  const mismatchMessage =
    open.error instanceof ApiError &&
    open.error.code === "OPENING_MISMATCH" &&
    mismatch !== null
      ? `Isi alasan bila modal berbeda dari ${formatRupiah(mismatch)}`
      : null;
  return (
    <form
      className="grid gap-3"
      onKeyDownCapture={(e) => {
        // Enter penutup rentetan scanner di elemen mana pun tidak boleh mengirim.
        const now = performance.now();
        if (/^\d$/.test(e.key)) {
          lastDigitAt.current = now;
        } else if (
          e.key === "Enter" &&
          now - lastDigitAt.current < SCAN_GAP_MS
        ) {
          e.preventDefault();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || openingCash === null) return;
        open.mutate({
          data: differs ? { openingCash, openingNote: note } : { openingCash },
        });
      }}
    >
      <div className="grid gap-1">
        <MoneyField
          label="Modal awal di laci"
          value={text}
          onChange={setText}
        />
        <SuggestionNotes suggestion={suggestion} diff={differs ? diff : 0} />
      </div>
      {differs && (
        <div className="grid gap-1">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Alasan modal berbeda
          </label>
          <Input
            id={reasonId}
            autoComplete="off"
            maxLength={REASON_MAX}
            value={reason}
            onKeyDown={guard.onKeyDown}
            onChange={(e) => {
              setReason(e.target.value);
              guard.reset();
            }}
          />
          <ScannedAlert
            show={guard.scanned}
            text="Itu hasil scan barcode, bukan alasan"
          />
          <OwnerPhoneLine phone={settings?.ownerPhone ?? null} />
        </div>
      )}
      {open.isError && !guard.scanned && (
        <p role="alert" className="text-sm font-medium text-danger">
          {mismatchMessage ?? pesanError(open.error)}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={!ready}
        aria-busy={open.isPending}
      >
        Buka shift
      </Button>
    </form>
  );
}
