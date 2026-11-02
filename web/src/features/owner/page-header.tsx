import { useRef } from "react";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { useScrolledPast } from "@/shared/hooks/use-scrolled-past";
import {
  type ServerHealth,
  useServerHealth,
} from "@/shared/hooks/use-server-health";
import { cn } from "@/shared/lib/cn";

function StoreStatus({ online, checking }: ServerHealth) {
  // Wadah role=status selalu ada agar perubahan diumumkan; kosong selama memeriksa.
  return (
    <span role="status" className="shrink-0">
      {!checking && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold",
            online
              ? "bg-primary-soft text-primary"
              : "bg-danger/10 text-danger",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              online ? "bg-primary" : "bg-danger",
            )}
          />
          {online ? "Toko online" : "Toko offline"}
        </span>
      )}
    </span>
  );
}

/** Bar atas kecil ala iOS: hanya < 1024px, muncul saat judul besar sudah tergulir lewat. */
function CompactTitle({ title, visible }: { title: string; visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-testid="compact-title"
      className={cn(
        "glass fixed inset-x-0 top-0 z-20 flex h-13 items-center justify-center px-4 text-[17px] font-semibold transition-opacity duration-200 motion-reduce:transition-none lg:hidden",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {title}
    </div>
  );
}

export function PageHeader({ title }: { title: string }) {
  const { label } = useBusinessDay();
  const health = useServerHealth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrolledPast = useScrolledPast(titleRef);

  return (
    <header className="px-4 pt-4 pb-3 lg:col-start-2 lg:row-start-1 lg:px-6 lg:pt-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-[13px] font-semibold text-muted">{label}</p>
        <div className="flex items-center justify-between gap-3">
          <h1
            ref={titleRef}
            className="text-[32px] leading-tight font-bold tracking-[-0.025em]"
          >
            {title}
          </h1>
          <StoreStatus {...health} />
        </div>
      </div>
      <CompactTitle title={title} visible={scrolledPast} />
    </header>
  );
}
