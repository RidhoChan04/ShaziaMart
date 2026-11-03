import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { cn } from "@/shared/lib/cn";
import { useScrolledPast } from "../use-scrolled-past";

export const pillClass =
  "inline-flex h-11 items-center gap-0.5 rounded-full bg-surface pr-4 pl-2.5 text-[15px] font-semibold text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

/** Kembali ke halaman sebelumnya bila ada riwayat (menjaga filter di URL), selain itu ke `fallback`. */
function BackControl({
  label,
  fallback,
}: {
  label: string;
  fallback: "/owner/barang";
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const content = (
    <>
      <ChevronLeft aria-hidden="true" className="size-5" />
      {label}
    </>
  );
  if (canGoBack) {
    return (
      <button
        type="button"
        className={pillClass}
        onClick={() => router.history.back()}
      >
        {content}
      </button>
    );
  }
  return (
    <Link to={fallback} className={pillClass}>
      {content}
    </Link>
  );
}

/** Judul besar sub-halaman (detail, form, impor): tombol kembali, aksi opsional, h1 yang jadi bar kecil saat tergulir. */
export function SubPageHeader({
  title,
  eyebrow,
  back,
  action,
}: {
  title: string;
  eyebrow?: string;
  back: { label: string; fallback: "/owner/barang" };
  action?: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrolledPast = useScrolledPast(titleRef);
  return (
    <header className="pt-3 pb-3 lg:pt-4">
      <div className="flex items-center justify-between gap-3">
        <BackControl {...back} />
        {action}
      </div>
      {eyebrow && (
        <p className="mt-3 text-[13px] font-semibold text-muted">{eyebrow}</p>
      )}
      <h1
        ref={titleRef}
        // Tujuan fokus setelah lembar yang dibuka dari URL (tanpa tombol pemicu) ditutup.
        tabIndex={-1}
        className={cn(
          "text-[28px] leading-tight font-bold tracking-[-0.025em]",
          eyebrow ? "mt-0.5" : "mt-3",
        )}
      >
        {title}
      </h1>
      <div
        aria-hidden="true"
        data-testid="compact-title"
        className={cn(
          "glass fixed inset-x-0 top-0 z-20 flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-center px-4 pt-[env(safe-area-inset-top)] text-[17px] font-semibold transition-opacity duration-200 motion-reduce:transition-none lg:hidden",
          scrolledPast ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {title}
      </div>
    </header>
  );
}
