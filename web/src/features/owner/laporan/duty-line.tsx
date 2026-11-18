import type { DutyEntry } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDayMonth, jakartaIsoDate } from "@/shared/lib/business-day";

const part = (n: number, word: string) => (n > 0 ? `${n} ${word}` : "");

/** Yang bertugas sejak hitungan sebelumnya (K20): `Sejak hitungan 31 Okt: Dedi 1 shift · Rina 4 shift, 2 catatan`. */
export function dutyLineText(
  prevCountedAt: number | null,
  duty: DutyEntry[],
): string {
  if (prevCountedAt === null) return "Hitungan pertama";
  if (duty.length === 0) return "Tidak ada shift atau catatan";
  const people = duty.map((d) =>
    [
      d.name,
      [part(d.shifts, "shift"), part(d.records, "catatan")]
        .filter(Boolean)
        .join(", "),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return `Sejak hitungan ${formatIsoDayMonth(jakartaIsoDate(prevCountedAt))}: ${people.join(" · ")}`;
}

/** Kotak yang bertugas di jeda satu hitungan kurang. */
export function DutyLine({
  prevCountedAt,
  duty,
}: {
  prevCountedAt: number | null;
  duty: DutyEntry[];
}) {
  return (
    <p className="mt-2 rounded-[10px] bg-bg px-3 py-2 text-[13px] text-muted">
      {dutyLineText(prevCountedAt, duty)}
    </p>
  );
}
