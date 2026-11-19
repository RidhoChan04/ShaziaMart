import { CircleDot, Lock, type LucideIcon, UserX } from "lucide-react";
import type { OwnerKasirAccount } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaTime } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";

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
      label: `Terkunci sampai ${jakartaTime(account.lockedUntil)}`,
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
