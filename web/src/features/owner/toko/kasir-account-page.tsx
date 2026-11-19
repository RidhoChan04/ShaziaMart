import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import {
  getListOwnerKasirAccountsQueryKey,
  useListOwnerKasirAccounts,
  useUpdateOwnerKasirAccount,
} from "@/shared/api/gen/owner/owner";
import type { OwnerKasirAccount } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import { KasirPinSheet } from "./kasir-pin-sheet";
import { KasirRenameSheet } from "./kasir-rename-sheet";
import { KasirStatus } from "./kasir-status";

const DEACTIVATE_NOTE =
  "Tidak bisa masuk di kasir maupun HP toko. Riwayat tetap tersimpan.";

/** Aktifkan lagi / Nonaktifkan; kasir yang sedang shift ditolak server (KASIR_ON_SHIFT). */
function ActiveToggle({ account }: { account: OwnerKasirAccount }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const toggle = useUpdateOwnerKasirAccount({
    mutation: {
      onSuccess: async (saved) => {
        await client.invalidateQueries({
          queryKey: getListOwnerKasirAccountsQueryKey(),
        });
        toast.success(saved.active ? "Akun diaktifkan" : "Akun dinonaktifkan");
      },
      onSettled: () => setOpen(false),
    },
  });
  const set = (active: boolean) =>
    toggle.mutate({ userId: account.id, data: { active } });
  const errorText = !toggle.isError
    ? null
    : toggle.error instanceof ApiError && toggle.error.code === "KASIR_ON_SHIFT"
      ? `Tutup shift ${account.name} dulu`
      : pesanError(toggle.error);

  if (!account.active) {
    return (
      <div className="grid gap-2">
        <Button
          className="h-12 w-full text-[17px]"
          disabled={toggle.isPending}
          onClick={() => set(true)}
        >
          Aktifkan lagi
        </Button>
        {errorText && <ErrorLine text={errorText} />}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && toggle.isPending) return;
          setOpen(next);
          if (next) toggle.reset();
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="h-12 w-full text-[17px] text-danger"
          >
            Nonaktifkan
          </Button>
        </DialogTrigger>
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{`Nonaktifkan ${account.name}?`}</DialogTitle>
            <DialogDescription>{DEACTIVATE_NOTE}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={toggle.isPending}>
                Kembali
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={toggle.isPending}
              onClick={() => set(false)}
            >
              Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {errorText && <ErrorLine text={errorText} />}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-1 text-[13px] font-medium text-danger"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {text}
    </p>
  );
}

/** Detail akun kasir: status, Ubah nama, Atur ulang PIN, Nonaktifkan / Aktifkan lagi. PIN tidak pernah ditampilkan. */
export function KasirAccountPage() {
  const { userId } = useParams({ from: "/owner/lainnya/kasir/$userId" });
  const query = useListOwnerKasirAccounts();
  const account = query.data?.find((a) => a.id === userId);
  return (
    <div className="lg:max-w-2xl">
      <SubPageHeader
        title={account?.name ?? "Akun kasir"}
        back={{ label: "Akun kasir", fallback: "/owner/lainnya" }}
      />
      {account ? (
        <div className="grid gap-4">
          <div className="grid gap-1.5 rounded-lg bg-surface p-4">
            <p className="text-[13px] font-semibold text-muted">Status</p>
            <div>
              <KasirStatus account={account} />
            </div>
            {!account.active && (
              <p className="text-[13px] text-muted">{DEACTIVATE_NOTE}</p>
            )}
          </div>
          <div className="overflow-hidden rounded-lg bg-surface">
            <RowList>
              <li>
                <KasirRenameSheet account={account} />
              </li>
              <li>
                <KasirPinSheet account={account} />
              </li>
            </RowList>
          </div>
          <ActiveToggle account={account} />
        </div>
      ) : query.isError ? (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(query.error)}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : query.data ? (
        <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
          Akun kasir tidak ditemukan
        </p>
      ) : (
        <p role="status" className="text-muted">
          Memuat…
        </p>
      )}
    </div>
  );
}
