import type { UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";

/** Tanda status: ikon + teks; `danger` hanya untuk rugi, `warn` untuk perhatian. */
export function ToneBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: "warn" | "danger";
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "danger"
          ? "bg-danger-soft text-danger-ink"
          : "bg-warning-soft text-warning-ink",
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {children}
    </span>
  );
}

/** Kartu ringkasan: label kecil, angka besar, keterangan. */
export function StatCard({
  label,
  value,
  note,
  extra,
}: {
  label: string;
  value: string;
  note: string;
  extra?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-surface p-4">
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className="text-[22px] font-bold tabular-nums">{value}</p>
      <p className="text-[13px] text-muted tabular-nums">{note}</p>
      {extra}
    </div>
  );
}

/** Tampilan muat/galat laporan; `children` hanya dirender saat data ada. */
export function ReportState({
  query,
  children,
}: {
  query: Pick<
    UseQueryResult<unknown>,
    "data" | "error" | "isError" | "refetch"
  >;
  children: ReactNode;
}) {
  if (query.data !== undefined) return <>{children}</>;
  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
        <p className="text-base font-semibold">{pesanError(query.error)}</p>
        <Button onClick={() => void query.refetch()}>Coba lagi</Button>
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Memuat laporan"
      className="grid gap-3"
    >
      <div className="h-[96px] animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
      <div className="h-[200px] animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
    </div>
  );
}
