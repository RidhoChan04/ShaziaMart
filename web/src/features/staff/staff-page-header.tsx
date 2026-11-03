import type { ReactNode } from "react";

/** Judul besar ala app pemilik: baris kecil di atas (opsional), judul, aksi di kanan. */
export function StaffPageHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="px-4 pt-4 pb-3 lg:col-start-2 lg:row-start-1 lg:px-6 lg:pt-6">
      <div className="mx-auto max-w-6xl">
        {eyebrow && (
          <div className="text-[13px] font-semibold text-muted">{eyebrow}</div>
        )}
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-[32px] leading-tight font-bold tracking-[-0.025em]">
            {title}
          </h1>
          {action}
        </div>
      </div>
    </header>
  );
}
