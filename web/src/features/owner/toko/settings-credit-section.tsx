import { useId, useState } from "react";
import {
  NumberField,
  numberOf,
  SectionForm,
  type SectionProps,
  useSaveSection,
} from "./settings-fields";
import { formatNumber } from "./settings-format";

/** Kasbon: limit untuk pelanggan baru yang dibuat dari kasir. */
export function CreditSection({ settings, onSaved }: SectionProps) {
  const [limit, setLimit] = useState(
    formatNumber("money", settings.credit.defaultCreditLimit),
  );
  const { save, pending, serverError, reset } = useSaveSection(onSaved);
  const errorId = useId();
  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onEdit={reset}
      onSubmit={() => {
        const n = numberOf("money", limit);
        if (n !== null) save({ credit: { defaultCreditLimit: n } });
      }}
    >
      <NumberField
        label="Limit kasbon pelanggan baru"
        kind="money"
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
