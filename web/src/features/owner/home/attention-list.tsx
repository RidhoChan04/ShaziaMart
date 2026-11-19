import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  BanknoteArrowDown,
  BanknoteX,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  ClipboardX,
  Clock,
  FileX,
  Gauge,
  HandCoins,
  Hourglass,
  type LucideIcon,
  NotebookPen,
  PackageX,
  QrCode,
  ReceiptText,
  Tag,
  TrendingDown,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Attention } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { type AttentionItem, attentionItems } from "./home-model";

/** Beranda menampilkan paling banyak segini; sisanya lewat `Lihat semua` (S8). */
export const HOME_ATTENTION_LIMIT = 6;

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
  "opname-flag": ClipboardX,
  "opname-held": ClipboardCheck,
  "exception-void": FileX,
  "exception-repay": ReceiptText,
  "exception-limit": Gauge,
  "exception-cash-void": BanknoteX,
  "cash-expense": BanknoteArrowDown,
  handover: ArrowRightLeft,
  "long-shift": Clock,
  "small-shortage": TrendingDown,
  qris: QrCode,
};

/** Baris butir (tautan ke halamannya); `action` = tombol di bawah baris, sejajar teks (halaman Lihat semua). */
export function AttentionRow({
  item,
  action,
}: {
  item: AttentionItem;
  action?: ReactNode;
}) {
  const { title, detail, tone, icon, link } = item;
  const Icon = ICONS[icon];
  return (
    <li className="relative [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:left-[58px] [&:not(:first-child)]:before:border-t [&:not(:first-child)]:before:border-border">
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
      {action && <div className="pr-4 pb-3 pl-[58px]">{action}</div>}
    </li>
  );
}

export function AttentionList({ attention }: { attention: Attention }) {
  const items = attentionItems(attention);
  const total = items.length;
  return (
    <section aria-labelledby="attention-title">
      <h2 id="attention-title" className="mb-2 text-xl font-bold">
        {total > 0 ? `Perlu perhatian · ${total}` : "Perlu perhatian"}
      </h2>
      <ul className="overflow-hidden rounded-lg bg-surface">
        {total === 0 ? (
          <li className="flex min-h-14 items-center gap-3 px-4 py-2">
            <CircleCheck
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
            />
            Semua aman hari ini
          </li>
        ) : (
          items
            .slice(0, HOME_ATTENTION_LIMIT)
            .map((item) => <AttentionRow key={item.key} item={item} />)
        )}
        {total > HOME_ATTENTION_LIMIT && (
          <li className="relative before:absolute before:inset-x-0 before:top-0 before:left-[58px] before:border-t before:border-border">
            <Link
              to="/owner/perhatian"
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 font-semibold text-primary hover:bg-bg"
            >
              {`Lihat semua (${total})`}
              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
