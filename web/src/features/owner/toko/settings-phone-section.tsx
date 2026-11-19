import { useId, useState } from "react";
import {
  SectionForm,
  type SectionProps,
  TextField,
  useSaveSection,
} from "./settings-fields";

/** Nomor telepon pemilik; dikosongkan dikirim `null` (baris Ragu? Telepon pemilik tidak tampil di kasir). */
export function PhoneSection({ settings, onSaved }: SectionProps) {
  const [phone, setPhone] = useState(settings.ownerPhone ?? "");
  const { save, pending, serverError, reset } = useSaveSection(onSaved);
  const errorId = useId();
  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onEdit={reset}
      onSubmit={() => {
        const trimmed = phone.trim();
        save({ ownerPhone: trimmed === "" ? null : trimmed });
      }}
    >
      <TextField
        label="Nomor telepon pemilik"
        value={phone}
        onChange={setPhone}
        inputMode="tel"
        invalid={serverError !== null}
        describedBy={serverError !== null ? errorId : undefined}
        hint="Tampil di dialog alasan kasir. Dikosongkan = baris itu tidak tampil."
      />
    </SectionForm>
  );
}
