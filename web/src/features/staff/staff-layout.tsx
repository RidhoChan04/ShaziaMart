import { Link, Outlet } from "@tanstack/react-router";
import { User, Wifi, WifiOff } from "lucide-react";
import { useLayoutEffect } from "react";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { cn } from "@/shared/lib/cn";
import { StaffGate } from "./auth/staff-gate";
import { useStaffSession } from "./auth/staff-session";
import { StaffSyncProvider } from "./drafts/sync-context";
import { StaffNav, useStaffTabRoot } from "./staff-nav";
import { StaffPageHeader } from "./staff-page-header";

/** Siapa yang masuk dan apakah HP tersambung ke toko (ikon + teks). */
function ConnectionStatus({ name }: { name: string }) {
  const { online, checking } = useServerHealth();
  const offline = !online && !checking;
  const Icon = offline ? WifiOff : Wifi;
  // Wadah role=status selalu ada agar perubahan diumumkan; selama memeriksa hanya nama.
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5",
        offline && "text-danger",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {checking
        ? name
        : `${name} · ${offline ? "Tidak tersambung ke toko" : "Wi-Fi toko"}`}
    </span>
  );
}

function AccountLink() {
  return (
    <Link
      to="/staff/lainnya"
      aria-label="Akun"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <User aria-hidden="true" className="size-5" />
    </Link>
  );
}

function StaffShell() {
  const tab = useStaffTabRoot();
  const name = useStaffSession().data?.user.name ?? "";

  return (
    <div className="min-h-dvh bg-bg pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] lg:grid lg:grid-cols-[240px_1fr] lg:grid-rows-[auto_1fr]">
      {/* Judul besar kerangka hanya di akar tab; sub-halaman punya header sendiri. */}
      {tab && (
        <StaffPageHeader
          title={tab.title}
          eyebrow={<ConnectionStatus name={name} />}
          action={tab.to === "/staff" ? <AccountLink /> : undefined}
        />
      )}
      <StaffNav />
      <main className="px-4 pt-1 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:col-start-2 lg:row-start-2 lg:px-6 lg:pt-2 lg:pb-6">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Kirim otomatis draf berjalan di semua tab selama pengguna masuk. */
function SyncedShell() {
  const userId = useStaffSession().data?.user.id ?? null;
  return (
    <StaffSyncProvider userId={userId}>
      <StaffShell />
    </StaffSyncProvider>
  );
}

export function StaffLayout() {
  // Di <html> (bukan wrapper) agar portal Radix (dialog, sheet) ikut token app pemilik.
  useLayoutEffect(() => {
    document.documentElement.dataset.app = "staff";
    return () => {
      delete document.documentElement.dataset.app;
    };
  }, []);
  return (
    <StaffGate>
      <SyncedShell />
    </StaffGate>
  );
}
