import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleCheck,
  HandCoins,
  Hourglass,
  type LucideIcon,
  NotebookPen,
  PackageX,
  Tag,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { Attention } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { type AttentionItem, attentionItems } from "./home-model";

// Ikon ditentukan jenis masalah; warna kotak hanya menegaskan tingkat keparahan.
const ICONS: Record<AttentionItem["icon"], LucideIcon> = {
  stock: TriangleAlert,
  cost: Tag,
  stockout: PackageX,
  cash: Wallet,
  credit: NotebookPen,
  debt: HandCoins,
  price: Tag,
  expiry: Hourglass,
};

export function AttentionList({ attention }: { attention: Attention }) {
  const items = attentionItems(attention);
  return (
    <section aria-labelledby="attention-title">
      <h2 id="attention-title" className="mb-2 text-xl font-bold">
        Perlu perhatian
      </h2>
      <ul className="overflow-hidden rounded-lg bg-surface">
        {items.length === 0 ? (
          <li className="flex min-h-14 items-center gap-3 px-4 py-2">
            <CircleCheck
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
            />
            Semua aman hari ini
          </li>
        ) : (
          items.map(({ key, title, detail, tone, icon, link }) => {
            const Icon = ICONS[icon];
            return (
              <li
                key={key}
                className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:left-[58px] [&:not(:first-child)]:before:border-t [&:not(:first-child)]:before:border-border"
              >
                <Link
                  {...link}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-bg"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[30px] shrink-0 place-items-center rounded-[8px] text-primary-foreground",
                      tone === "critical" ? "bg-danger" : "bg-warning",
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base">{title}</span>{" "}
                    <span className="block truncate text-[13px] text-muted">
                      {detail}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted"
                  />
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
