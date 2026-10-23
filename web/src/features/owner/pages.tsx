import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useOwnerLogout } from "@/shared/api/gen/owner/owner";
import { Button } from "@/shared/ui/button";
import { clearOwnerSession } from "./auth/owner-session";

/** Halaman pemilik sementara; isi nyata dibangun di rencana berikutnya. */
function PlaceholderPage({ title }: { title: string }) {
  return <h1 className="text-xl font-bold">{title}</h1>;
}

export function BarangPage() {
  return <PlaceholderPage title="Barang" />;
}

export function LaporanPage() {
  return <PlaceholderPage title="Laporan" />;
}

export function KasbonPage() {
  return <PlaceholderPage title="Kasbon" />;
}

export function LainnyaPage() {
  const client = useQueryClient();
  const logout = useOwnerLogout({
    mutation: { onSuccess: () => clearOwnerSession(client) },
  });
  return (
    <div className="grid gap-4">
      <PlaceholderPage title="Lainnya" />
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" />
        Keluar
      </Button>
    </div>
  );
}
