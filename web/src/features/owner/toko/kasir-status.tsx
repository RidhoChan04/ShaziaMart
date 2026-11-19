import { CircleDot, Lock, type LucideIcon, UserX } from "lucide-react";
import type { OwnerKasirAccount } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";

const WIB_MS = 7 * 3_600_000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Jam dinding WIB `20.45`. Ditulis di sini (bukan dari business-day) agar chunk toko tidak menarik business-day keluar dari chunk pemilik. */
function wibClock(ms: number): string {
  const d = new Date(ms + WIB_MS);
  return `${pad2(d.getUTCHours())}.${pad2(d.getUTCMinutes())}`;
}

type Tone = "ok" | "warn" | "neutral";
type Status = { label: string; tone: Tone; icon: LucideIcon } | null;

/** Status akun dari server; null = Aktif biasa (hanya teks). Nonaktif lebih dulu, lalu sedang shift, lalu terkunci. */
export function statusOf(account: OwnerKasirAccount): Status {
  if (!account.active) {
    return { label: "Nonaktif", tone: "neutral", icon: UserX };
  }
  if (account.onShift) {
    return { label: "Sedang shift", tone: "ok", icon: CircleDot };
  }
  if (account.lockedUntil !== null) {
    return {
      label: `Terkunci sampai ${wibClock(account.lockedUntil)}`,
      tone: "warn",
      icon: Lock,
    };
  }
  return null;
}

const TONES: Record<Tone, string> = {
  ok: "bg-primary-soft text-primary",
  warn: "bg-warning-soft text-warning-ink",
  neutral: "bg-border text-text",
};

/** Status = ikon + teks; akun aktif biasa cukup teks `Aktif`. */
export function KasirStatus({ account }: { account: OwnerKasirAccount }) {
  const status = statusOf(account);
  if (status === null) {
    return <span className="text-[15px] text-muted">Aktif</span>;
  }
  const Icon = status.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[status.tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {status.label}
    </span>
  );
}
