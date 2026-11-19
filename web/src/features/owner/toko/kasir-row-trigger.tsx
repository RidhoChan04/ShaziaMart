import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";

/** Baris aksi gaya Settings (judul + `›`) yang membuka lembar. */
export function AccountRowTrigger({
  label,
  ...props
}: { label: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-[17px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      {label}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
    </button>
  );
}
