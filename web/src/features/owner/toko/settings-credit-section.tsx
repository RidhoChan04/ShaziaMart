import { useId, useState } from "react";
import type { OwnerSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatAngka } from "@/shared/lib/money";
import {
  NumberField,
  SectionForm,
  toInt,
  useSaveSection,
} from "./settings-fields";

/** Kasbon: limit untuk pelanggan baru yang dibuat dari kasir. */
export function CreditSection({ settings }: { settings: OwnerSettings }) {
  const [limit, setLimit] = useState(
    formatAngka(settings.credit.defaultCreditLimit),
  );
  const { save, pending, serverError } = useSaveSection();
  const errorId = useId();
  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onSubmit={() => {
        const n = toInt(limit);
        if (n !== null) save({ credit: { defaultCreditLimit: n } });
      }}
    >
      <NumberField
        label="Limit kasbon pelanggan baru"
        prefix="Rp"
        value={limit}
        onChange={setLimit}
        invalid={serverError !== null}
        describedBy={serverError !== null ? errorId : undefined}
      />
      <p className="text-[13px] text-muted">
        Berlaku untuk pelanggan yang ditambahkan dari kasir. Limit pelanggan
        yang sudah ada tidak berubah.
      </p>
    </SectionForm>
  );
}
