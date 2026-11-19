import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  getListOwnerKasirAccountsQueryKey,
  useCreateOwnerKasirAccount,
} from "@/shared/api/gen/owner/owner";
import { Button } from "@/shared/ui/button";
import {
  KasirFormSheet,
  NameField,
  nameValid,
  PinFields,
  pesanKasir,
  usePinFields,
} from "./kasir-form-sheet";

/** Tombol `Tambah kasir` + lembar: nama, PIN 6 angka, ulangi PIN. */
export function KasirAddSheet() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const pins = usePinFields();
  const create = useCreateOwnerKasirAccount({
    // gcTime 0: variabel (berisi PIN) tidak tinggal di cache mutasi setelah lembar ditutup.
    mutation: {
      gcTime: 0,
      onSuccess: async () => {
        await client.invalidateQueries({
          queryKey: getListOwnerKasirAccountsQueryKey(),
        });
        toast.success("Kasir ditambahkan");
        pins.clear();
        setOpen(false);
        create.reset();
      },
    },
  });
  return (
    <KasirFormSheet
      title="Tambah kasir"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          pins.clear();
          create.reset();
        } else {
          pins.clear();
          create.reset();
        }
      }}
      trigger={
        <Button className="h-12 w-full text-[17px]">
          <Plus aria-hidden="true" className="size-5" />
          Tambah kasir
        </Button>
      }
      submitLabel="Simpan"
      canSubmit={nameValid(name) && pins.valid}
      pending={create.isPending}
      error={create.isError ? pesanKasir(create.error) : null}
      onSubmit={() =>
        create.mutate({ data: { name: name.trim(), pin: pins.pin } })
      }
    >
      <NameField value={name} onChange={setName} />
      <PinFields fields={pins} />
    </KasirFormSheet>
  );
}
