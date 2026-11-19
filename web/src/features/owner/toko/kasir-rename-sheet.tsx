import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getListOwnerKasirAccountsQueryKey,
  useUpdateOwnerKasirAccount,
} from "@/shared/api/gen/owner/owner";
import type { OwnerKasirAccount } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  KasirFormSheet,
  NameField,
  nameValid,
  pesanKasir,
} from "./kasir-form-sheet";
import { AccountRowTrigger } from "./kasir-row-trigger";

/** Baris `Ubah nama` + lembar. Nama lama di riwayat tidak berubah (server). */
export function KasirRenameSheet({ account }: { account: OwnerKasirAccount }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const rename = useUpdateOwnerKasirAccount({
    mutation: {
      onSuccess: async () => {
        await client.invalidateQueries({
          queryKey: getListOwnerKasirAccountsQueryKey(),
        });
        toast.success("Nama diubah");
        setOpen(false);
      },
    },
  });
  return (
    <KasirFormSheet
      title="Ubah nama"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(account.name);
          rename.reset();
        }
      }}
      trigger={<AccountRowTrigger label="Ubah nama" />}
      submitLabel="Simpan"
      canSubmit={nameValid(name)}
      pending={rename.isPending}
      error={rename.isError ? pesanKasir(rename.error) : null}
      onSubmit={() =>
        rename.mutate({ userId: account.id, data: { name: name.trim() } })
      }
    >
      <NameField value={name} onChange={setName} />
    </KasirFormSheet>
  );
}
