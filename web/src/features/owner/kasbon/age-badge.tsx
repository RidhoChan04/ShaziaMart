import { Clock } from "lucide-react";

/** Tanda peringatan kasbon lama = ikon jam + teks (warna saja tidak cukup). */
export function AgeBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning-ink">
      <Clock aria-hidden="true" className="size-3" />
      {text}
    </span>
  );
}
