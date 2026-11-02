import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useOwnerLogout } from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { clearOwnerSession } from "./auth/owner-session";
import { SubPageHeader } from "./common/sub-page-header";

/** Isi halaman pemilik sementara; judulnya dari header kerangka, isi nyata menyusul. */
function PlaceholderPage() {
  return <p className="text-muted">Segera hadir</p>;
}

/** Sub-halaman Barang yang belum ada (Task 8/9/12 menggantinya satu per satu). */
export function SegeraHadirPage() {
  return (
    <SubPageHeader
      title="Segera hadir"
      back={{ label: "Barang", fallback: "/owner/barang" }}
    />
  );
}

export function LaporanPage() {
  return <PlaceholderPage />;
}

export function KasbonPage() {
  return <PlaceholderPage />;
}

export function LainnyaPage() {
  const client = useQueryClient();
  const logout = useOwnerLogout({
    mutation: { onSuccess: () => clearOwnerSession(client) },
  });
  return (
    <div className="grid gap-4">
      <PlaceholderPage />
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" />
        Keluar
      </Button>
      {logout.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(logout.error)}
        </p>
      )}
    </div>
  );
}
