import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getListOwnerKasirAccountsQueryKey,
  useResetOwnerKasirPin,
} from "@/shared/api/gen/owner/owner";
import type { OwnerKasirAccount } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  KasirFormSheet,
  PinFields,
  pesanKasir,
  usePinFields,
} from "./kasir-form-sheet";
import { AccountRowTrigger } from "./kasir-row-trigger";

/** Baris `Atur ulang PIN` + lembar: PIN baru dua kali; PIN lama tidak pernah ditampilkan. */
export function KasirPinSheet({ account }: { account: OwnerKasirAccount }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const pins = usePinFields();
  const reset = useResetOwnerKasirPin({
    mutation: {
      onSuccess: async () => {
        await client.invalidateQueries({
          queryKey: getListOwnerKasirAccountsQueryKey(),
        });
        toast.success("PIN diatur ulang");
        pins.clear();
        setOpen(false);
      },
    },
  });
  return (
    <KasirFormSheet
      title="Atur ulang PIN"
      description={account.name}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        pins.clear();
        if (next) reset.reset();
      }}
      trigger={<AccountRowTrigger label="Atur ulang PIN" />}
      submitLabel="Simpan"
      canSubmit={pins.valid}
      pending={reset.isPending}
      error={reset.isError ? pesanKasir(reset.error) : null}
      onSubmit={() =>
        reset.mutate({ userId: account.id, data: { pin: pins.pin } })
      }
    >
      <PinFields fields={pins} pinLabel="PIN baru (6 angka)" />
    </KasirFormSheet>
  );
}
