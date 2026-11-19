import { useId, useState } from "react";
import {
  NumberField,
  numberOf,
  SectionForm,
  type SectionProps,
  useSaveSection,
} from "./settings-fields";
import { formatNumber } from "./settings-format";

/** Stok: batas segera kedaluwarsa dan batas selisih opname. */
export function StockSection({ settings, onSaved }: SectionProps) {
  const { stock } = settings;
  const [days, setDays] = useState(formatNumber("plain", stock.expirySoonDays));
  const [item, setItem] = useState(
    formatNumber("money", stock.opnameItemLimit),
  );
  const [session, setSession] = useState(
    formatNumber("money", stock.opnameSessionLimit),
  );
  const { save, pending, serverError, reset } = useSaveSection(onSaved);
  const errorId = useId();
  const invalid = serverError !== null;
  const describedBy = invalid ? errorId : undefined;
  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onEdit={reset}
      onSubmit={() => {
        const d = numberOf("plain", days);
        const i = numberOf("money", item);
        const s = numberOf("money", session);
        if (d === null || i === null || s === null) return;
        save({
          stock: {
            expirySoonDays: d,
            opnameItemLimit: i,
            opnameSessionLimit: s,
          },
        });
      }}
    >
      <NumberField
        label="Segera kedaluwarsa dalam"
        kind="plain"
        suffix="hari"
        value={days}
        onChange={setDays}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Tahan selisih per barang di atas"
        kind="money"
        prefix="Rp"
        value={item}
        onChange={setItem}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Tandai selisih per sesi opname di atas"
        kind="money"
        prefix="Rp"
        value={session}
        onChange={setSession}
        invalid={invalid}
        describedBy={describedBy}
      />
    </SectionForm>
  );
}
