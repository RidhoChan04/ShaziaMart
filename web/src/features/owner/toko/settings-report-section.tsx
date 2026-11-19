import { useEffect, useId, useState } from "react";
import { useGetOwnerThinMarginPreview } from "@/shared/api/gen/owner/owner";
import { formatAngka } from "@/shared/lib/money";
import {
  NumberField,
  numberOf,
  SectionForm,
  type SectionProps,
  useSaveSection,
} from "./settings-fields";
import { formatNumber, formatPercent } from "./settings-format";

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

/** Laporan: batas untung tipis (persen ↔ permil, pratinjau dari server) dan hari tidak terjual. */
export function ReportSection({ settings, onSaved }: SectionProps) {
  const { report } = settings;
  const [percent, setPercent] = useState(
    formatNumber("percent", report.thinMarginPermille),
  );
  const [unsold, setUnsold] = useState(
    formatNumber("plain", report.unsoldDays),
  );
  const { save, pending, serverError, reset } = useSaveSection(onSaved);
  const errorId = useId();

  // Persen → permil (15 → 150, 12,5 → 125); tidak sah = tanpa pratinjau.
  const permille = numberOf("percent", percent);
  const debounced = useDebounced(permille, DEBOUNCE_MS);
  // Tanpa data lama yang dipertahankan: angka yang tampil selalu milik batas di labelnya.
  const preview = useGetOwnerThinMarginPreview(
    { permille: debounced ?? 0 },
    { query: { enabled: debounced !== null } },
  );

  return (
    <SectionForm
      pending={pending}
      error={serverError}
      errorId={errorId}
      onEdit={reset}
      onSubmit={() => {
        const u = numberOf("plain", unsold);
        if (permille === null || u === null) return;
        save({ report: { thinMarginPermille: permille, unsoldDays: u } });
      }}
    >
      <div className="grid gap-1.5">
        <NumberField
          label="Batas untung tipis"
          kind="percent"
          suffix="%"
          value={percent}
          onChange={setPercent}
          invalid={serverError !== null}
          describedBy={serverError !== null ? errorId : undefined}
        />
        <p role="status" className="min-h-5 text-[13px] text-muted">
          {preview.data && debounced !== null
            ? `Dengan batas ${formatPercent(debounced)}%: ${formatAngka(preview.data.flagged)} dari ${formatAngka(preview.data.total)} barang tertandai`
            : preview.isError
              ? "Pratinjau belum bisa dimuat"
              : ""}
        </p>
      </div>
      <NumberField
        label="Tidak terjual setelah"
        kind="plain"
        suffix="hari"
        value={unsold}
        onChange={setUnsold}
        invalid={serverError !== null}
        describedBy={serverError !== null ? errorId : undefined}
      />
    </SectionForm>
  );
}
