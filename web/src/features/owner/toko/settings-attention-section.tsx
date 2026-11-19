import { useId, useState } from "react";
import type { OwnerSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatAngka } from "@/shared/lib/money";
import {
  NumberField,
  SectionForm,
  SwitchField,
  toInts,
  useSaveSection,
} from "./settings-fields";

/** Perlu perhatian: lima batas lalu sakelar Pencocokan QRIS harian; disimpan utuh dalam satu PATCH `attention`. */
export function AttentionSection({ settings }: { settings: OwnerSettings }) {
  const a = settings.attention;
  const [cashDiffMin, setCashDiffMin] = useState(formatAngka(a.cashDiffMin));
  const [smallShortage, setSmallShortage] = useState(
    formatAngka(a.smallShortageWeekMax),
  );
  const [expenseSingle, setExpenseSingle] = useState(
    formatAngka(a.expenseSingleMax),
  );
  const [expenseShift, setExpenseShift] = useState(
    formatAngka(a.expenseShiftMax),
  );
  const [hours, setHours] = useState(formatAngka(a.shiftMaxHours));
  const [qris, setQris] = useState(a.qrisDailyReconcile);
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
        const values = toInts([
          cashDiffMin,
          smallShortage,
          expenseSingle,
          expenseShift,
          hours,
        ]);
        if (values === null) return;
        const [c = 0, s = 0, e = 0, x = 0, h = 0] = values;
        save({
          attention: {
            cashDiffMin: c,
            smallShortageWeekMax: s,
            expenseSingleMax: e,
            expenseShiftMax: x,
            shiftMaxHours: h,
            qrisDailyReconcile: qris,
          },
        });
      }}
    >
      <p className="text-[13px] text-muted">
        Batas untuk butir Perlu perhatian. Mengubah batas langsung mengubah
        butir yang tampil, termasuk kejadian lama.
      </p>
      <NumberField
        label="Abaikan selisih kas di bawah"
        prefix="Rp"
        value={cashDiffMin}
        onChange={setCashDiffMin}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Selisih kecil berulang per kasir dalam 7 hari di atas"
        prefix="Rp"
        value={smallShortage}
        onChange={setSmallShortage}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Kas keluar sekali di atas"
        prefix="Rp"
        value={expenseSingle}
        onChange={setExpenseSingle}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Total kas keluar per shift di atas"
        prefix="Rp"
        value={expenseShift}
        onChange={setExpenseShift}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        label="Shift dianggap kelamaan setelah"
        suffix="jam"
        value={hours}
        onChange={setHours}
        invalid={invalid}
        describedBy={describedBy}
      />
      <SwitchField
        label="Pencocokan QRIS harian"
        hint="Bila dimatikan, butir QRIS belum dicocokkan tidak tampil di Perlu perhatian. Halaman QRIS harian tetap tersedia."
        checked={qris}
        onChange={setQris}
      />
    </SectionForm>
  );
}
