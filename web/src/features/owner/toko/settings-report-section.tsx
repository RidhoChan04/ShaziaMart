import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useGetOwnerThinMarginPreview } from "@/shared/api/gen/owner/owner";
import type { OwnerSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatAngka } from "@/shared/lib/money";
import {
  NumberField,
  SectionForm,
  toInt,
  useSaveSection,
} from "./settings-fields";

const DEBOUNCE_MS = 300;

/** Nilai yang baru dipakai setelah berhenti berubah selama `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Persen untuk isian: permil / 10, koma bila tidak bulat (nilai lama). */
const percentText = (permille: number): string =>
  permille % 10 === 0
    ? String(permille / 10)
    : String(permille / 10).replace(".", ",");

/** Laporan: batas untung tipis (persen ↔ permil, pratinjau dari server) dan hari tidak terjual. */
export function ReportSection({ settings }: { settings: OwnerSettings }) {
  const { report } = settings;
  const initialText = percentText(report.thinMarginPermille);
  const [percent, setPercent] = useState(initialText);
  const [unsold, setUnsold] = useState(formatAngka(report.unsoldDays));
  const { save, pending, serverError } = useSaveSection();
  const errorId = useId();

  // Persen bulat → permil (15 → 150); nilai lama yang tidak bulat dipertahankan bila tidak diubah.
  const percentInt = toInt(percent);
  const permille =
    percent === initialText
      ? report.thinMarginPermille
      : percentInt === null
        ? null
        : percentInt * 10;
  const debounced = useDebounced(permille, DEBOUNCE_MS);
  const preview = useGetOwnerThinMarginPreview(
    { permille: debounced ?? 0 },
    {
      query: {
        enabled: debounced !== null,
        placeholderData: keepPreviousData,
      },
    },
  );

  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onSubmit={() => {
        const u = toInt(unsold);
        if (permille === null || u === null) return;
        save({ report: { thinMarginPermille: permille, unsoldDays: u } });
      }}
    >
      <div className="grid gap-1.5">
        <NumberField
          label="Batas untung tipis"
          suffix="%"
          value={percent}
          onChange={setPercent}
          invalid={serverError !== null}
          describedBy={serverError !== null ? errorId : undefined}
        />
        <p role="status" className="min-h-5 text-[13px] text-muted">
          {preview.data && debounced !== null
            ? `Dengan batas ${percentText(debounced)}%: ${formatAngka(preview.data.flagged)} dari ${formatAngka(preview.data.total)} barang tertandai`
            : preview.isError
              ? "Pratinjau belum bisa dimuat"
              : ""}
        </p>
      </div>
      <NumberField
        label="Tidak terjual setelah"
        suffix="hari"
        value={unsold}
        onChange={setUnsold}
        invalid={serverError !== null}
        describedBy={serverError !== null ? errorId : undefined}
      />
    </SectionForm>
  );
}
