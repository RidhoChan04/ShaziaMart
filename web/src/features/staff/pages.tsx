import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useStaffLogout } from "@/shared/api/gen/staff/staff";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { clearStaffSession, useStaffSession } from "./auth/staff-session";

export function StaffLainnyaPage() {
  const client = useQueryClient();
  const name = useStaffSession().data?.user.name ?? "";
  // Draf barang masuk di HP tidak dihapus: tersimpan per pengguna dan dikirim saat ia masuk lagi.
  const logout = useStaffLogout({
    mutation: { onSuccess: () => clearStaffSession(client) },
  });
  return (
    <div className="grid gap-4">
      <p className="rounded-lg bg-surface px-4 py-3.5 font-medium shadow-sm">
        {`Masuk sebagai ${name}`}
      </p>
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
