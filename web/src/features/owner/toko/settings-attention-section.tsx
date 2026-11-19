import { useId, useState } from "react";
import {
  NumberField,
  numberOf,
  SectionForm,
  type SectionProps,
  SwitchField,
  useSaveSection,
} from "./settings-fields";
import { formatNumber } from "./settings-format";

/** Perlu perhatian: lima batas lalu sakelar Pencocokan QRIS harian; disimpan utuh dalam satu PATCH `attention`. */
export function AttentionSection({ settings, onSaved }: SectionProps) {
  const a = settings.attention;
  const [cashDiffMin, setCashDiffMin] = useState(
    formatNumber("money", a.cashDiffMin),
  );
  const [smallShortage, setSmallShortage] = useState(
    formatNumber("money", a.smallShortageWeekMax),
  );
  const [expenseSingle, setExpenseSingle] = useState(
    formatNumber("money", a.expenseSingleMax),
  );
  const [expenseShift, setExpenseShift] = useState(
    formatNumber("money", a.expenseShiftMax),
  );
  const [hours, setHours] = useState(formatNumber("plain", a.shiftMaxHours));
  const [qris, setQris] = useState(a.qrisDailyReconcile);
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
        const c = numberOf("money", cashDiffMin);
        const sm = numberOf("money", smallShortage);
        const e = numberOf("money", expenseSingle);
        const x = numberOf("money", expenseShift);
        const h = numberOf("plain", hours);
        if (
          c === null ||
          sm === null ||
          e === null ||
          x === null ||
          h === null
        ) {
          return;
        }
        save({
          attention: {
            cashDiffMin: c,
            smallShortageWeekMax: sm,
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
        kind="money"
        label="Abaikan selisih kas di bawah"
        prefix="Rp"
        value={cashDiffMin}
        onChange={setCashDiffMin}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        kind="money"
        label="Selisih kecil berulang per kasir dalam 7 hari di atas"
        prefix="Rp"
        value={smallShortage}
        onChange={setSmallShortage}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        kind="money"
        label="Kas keluar sekali di atas"
        prefix="Rp"
        value={expenseSingle}
        onChange={setExpenseSingle}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        kind="money"
        label="Total kas keluar per shift di atas"
        prefix="Rp"
        value={expenseShift}
        onChange={setExpenseShift}
        invalid={invalid}
        describedBy={describedBy}
      />
      <NumberField
        kind="plain"
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
        onChange={(next) => {
          reset();
          setQris(next);
        }}
      />
    </SectionForm>
  );
}
