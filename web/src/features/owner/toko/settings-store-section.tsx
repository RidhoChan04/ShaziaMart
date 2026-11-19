import { useId, useState } from "react";
import { QrisUpload } from "./qris-upload";
import {
  SectionForm,
  type SectionProps,
  TextField,
  useSaveSection,
} from "./settings-fields";

/** Toko & struk: nama, alamat, catatan kaki struk (satu PATCH `store`) dan gambar QRIS (unggah sendiri). */
export function StoreSection({ settings, onSaved }: SectionProps) {
  const { store } = settings;
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [footer, setFooter] = useState(store.receiptFooter);
  const { save, pending, serverError, reset } = useSaveSection(onSaved);
  const errorId = useId();
  const invalid = serverError !== null;
  return (
    <div className="grid gap-4">
      <SectionForm
        pending={pending}
        error={serverError}
        errorId={errorId}
        onEdit={reset}
        onSubmit={() =>
          save({ store: { name, address, receiptFooter: footer } })
        }
      >
        <TextField
          label="Nama toko"
          value={name}
          onChange={setName}
          invalid={invalid}
          describedBy={invalid ? errorId : undefined}
        />
        <TextField
          label="Alamat"
          value={address}
          onChange={setAddress}
          invalid={invalid}
          describedBy={invalid ? errorId : undefined}
        />
        <TextField
          label="Catatan kaki struk"
          value={footer}
          onChange={setFooter}
          invalid={invalid}
          describedBy={invalid ? errorId : undefined}
          hint="Tercetak di bagian bawah struk."
        />
      </SectionForm>
      <div className="rounded-lg bg-surface p-4 lg:max-w-2xl">
        <QrisUpload currentUrl={store.qrisImageUrl} />
      </div>
    </div>
  );
}
