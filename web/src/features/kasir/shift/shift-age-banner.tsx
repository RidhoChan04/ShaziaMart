import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

const HOUR_MS = 3_600_000;
const TICK_MS = 60_000;

/**
 * Pita kecil di bawah header bila shift buka lebih lama dari batas Pengaturan (S3, K5):
 * ketat, tepat `maxHours` jam belum; `n` = jam penuh. Jam diperbarui tiap menit.
 */
export function ShiftAgeBanner({
  openedAt,
  maxHours,
}: {
  openedAt: number;
  maxHours: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const age = now - openedAt;
  if (age <= maxHours * HOUR_MS) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 font-medium text-warning-ink"
    >
      <Clock aria-hidden="true" className="size-[18px] shrink-0" />
      {`Shift sudah buka ${Math.floor(age / HOUR_MS)} jam — tutup shift saat gantian`}
    </div>
  );
}
