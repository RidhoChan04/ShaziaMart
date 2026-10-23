import { Link } from "@tanstack/react-router";
import {
  CircleCheck,
  type LucideIcon,
  NotebookPen,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { Attention } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { type AttentionItem, attentionItems } from "./home-model";

// Ikon ditentukan tujuan (jenis masalah); warna hanya menegaskan tingkat keparahan.
const ICONS: Record<AttentionItem["to"], LucideIcon> = {
  "/owner/barang": TriangleAlert,
  "/owner/lainnya": Wallet,
  "/owner/kasbon": NotebookPen,
};

export function AttentionList({ attention }: { attention: Attention }) {
  const items = attentionItems(attention);
  return (
    <section aria-labelledby="attention-title">
      <h2 id="attention-title" className="mb-1 text-[11px] text-muted">
        PERLU PERHATIAN
      </h2>
      <ul className="overflow-hidden rounded-lg border border-border bg-surface">
        {items.length === 0 ? (
          <li className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm">
            <CircleCheck
              aria-hidden="true"
              className="size-4 shrink-0 text-primary"
            />
            Semua aman hari ini
          </li>
        ) : (
          items.map(({ key, text, tone, to }) => {
            const Icon = ICONS[to];
            return (
              <li key={key} className="border-b border-border last:border-b-0">
                <Link
                  to={to}
                  className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm hover:bg-primary-soft"
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0",
                      tone === "critical" ? "text-danger" : "text-warning",
                    )}
                  />
                  {text}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
