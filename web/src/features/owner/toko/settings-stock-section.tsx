import { useId, useState } from "react";
import type { OwnerSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatAngka } from "@/shared/lib/money";
import {
  NumberField,
  SectionForm,
  toInt,
  useSaveSection,
} from "./settings-fields";

/** Stok: batas segera kedaluwarsa dan batas selisih opname. */
export function StockSection({ settings }: { settings: OwnerSettings }) {
  const { stock } = settings;
  const [days, setDays] = useState(formatAngka(stock.expirySoonDays));
  const [item, setItem] = useState(formatAngka(stock.opnameItemLimit));
  const [session, setSession] = useState(formatAngka(stock.opnameSessionLimit));
  const { save, pending, serverError } = useSaveSection();
  const errorId = useId();
  const invalid = serverError !== null;
  const describedBy = invalid ? errorId : undefined;
  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onSubmit={() => {
        const d = toInt(days);
        const i = toInt(item);
        const s = toInt(session);
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
        suffix="hari"
        value={days}
        onChange={setDays}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Tahan selisih per barang di atas"
        prefix="Rp"
        value={item}
        onChange={setItem}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Tandai selisih per sesi opname di atas"
        prefix="Rp"
        value={session}
        onChange={setSession}
        invalid={invalid}
        describedBy={describedBy}
      />
    </SectionForm>
  );
}
