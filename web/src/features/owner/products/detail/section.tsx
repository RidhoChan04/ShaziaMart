import { type ReactNode, useId } from "react";
import { cn } from "@/shared/lib/cn";

/** Bagian halaman detail: judul 20px tebal di atas kartu putih bulat; `region` bernama oleh judulnya. */
export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <h2
        id={id}
        className="mb-2 px-1 text-[20px] font-bold tracking-[-0.02em]"
      >
        {title}
      </h2>
      <div className="overflow-hidden rounded-lg bg-surface">{children}</div>
    </section>
  );
}

/** Daftar baris dalam kartu; semantik daftar dipertahankan walau list-style none. */
export function RowList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      // biome-ignore lint/a11y/noRedundantRoles: Safari/VoiceOver membuang semantik daftar bila list-style none
      role="list"
      className={cn("divide-y divide-border", className)}
    >
      {children}
    </ul>
  );
}
