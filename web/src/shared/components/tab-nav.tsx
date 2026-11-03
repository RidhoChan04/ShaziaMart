import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export type TabNavItem = {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  icon: LucideIcon;
  /** Aktif hanya di path itu sendiri (tab Beranda), bukan di sub-halamannya. */
  exact: boolean;
};

/** Tab bar kaca app HP (pemilik, orang toko): satu <nav> — tab bawah < 1024px, sidebar >= 1024px. */
export function TabNav({
  label,
  items,
}: {
  label: string;
  items: readonly TabNavItem[];
}) {
  return (
    <nav
      aria-label={label}
      className="glass fixed left-[calc(12px+env(safe-area-inset-left))] right-[calc(12px+env(safe-area-inset-right))] bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 rounded-full p-1 lg:sticky lg:right-auto lg:left-auto lg:top-3 lg:bottom-auto lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:m-3 lg:h-[calc(100dvh-24px)] lg:rounded-lg lg:p-2"
    >
      <ul className="flex gap-1 lg:flex-col">
        {items.map(({ to, label: text, icon: Icon, exact }) => (
          // Tanpa min-w-0: label panjang ("Kedaluwarsa") melebarkan tabnya sendiri, tab lain berbagi sisa.
          <li key={to} className="flex-1 lg:flex-none">
            <Link
              to={to}
              activeOptions={{ exact }}
              className="flex min-h-12 flex-col px-1 items-center justify-center gap-0.5 rounded-full text-xs text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary data-[status=active]:bg-primary-soft data-[status=active]:font-semibold data-[status=active]:text-primary lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:text-[15px] lg:hover:bg-primary-soft"
            >
              <Icon aria-hidden="true" className="size-5" />
              {text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
