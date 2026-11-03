import { useLocation } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Ellipsis,
  Hourglass,
  House,
  Truck,
} from "lucide-react";
import { TabNav, type TabNavItem } from "@/shared/components/tab-nav";

type StaffTab = TabNavItem & {
  to:
    | "/staff"
    | "/staff/masuk"
    | "/staff/opname"
    | "/staff/kedaluwarsa"
    | "/staff/lainnya";
  /** Judul besar di akar tab (bisa beda dengan label tab). */
  title: string;
};

const STAFF_TABS: readonly StaffTab[] = [
  { to: "/staff", label: "Beranda", title: "Stok", icon: House, exact: true },
  {
    to: "/staff/masuk",
    label: "Masuk",
    title: "Barang masuk",
    icon: Truck,
    exact: false,
  },
  {
    to: "/staff/opname",
    label: "Opname",
    title: "Stok opname",
    icon: ClipboardCheck,
    exact: false,
  },
  {
    to: "/staff/kedaluwarsa",
    label: "Kedaluwarsa",
    title: "Kedaluwarsa",
    icon: Hourglass,
    exact: false,
  },
  {
    to: "/staff/lainnya",
    label: "Lainnya",
    title: "Lainnya",
    icon: Ellipsis,
    exact: false,
  },
];

export function StaffNav() {
  return <TabNav label="Navigasi orang toko" items={STAFF_TABS} />;
}

/** Tab yang akarnya sedang dibuka; `undefined` di sub-halaman (mis. /staff/masuk/baru). */
export function useStaffTabRoot(): StaffTab | undefined {
  // Seperti Link: garis miring di akhir diabaikan.
  const path = useLocation({
    select: (l) => l.pathname.replace(/(.)\/$/, "$1"),
  });
  return STAFF_TABS.find(({ to }) => path === to);
}
