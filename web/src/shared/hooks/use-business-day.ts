import { useEffect, useMemo, useState } from "react";
import {
  businessDay,
  businessDayLabel,
  DAY_MS,
} from "@/shared/lib/business-day";

/** Hari bisnis (Asia/Jakarta) saat ini; berganti sendiri tepat setelah 00.00 WIB. */
export function useBusinessDay(): { date: string; label: string } {
  const [day, setDay] = useState(() => businessDay(Date.now()));
  useEffect(() => {
    // Objek baru tiap kali timer jalan, jadi timer yang meleset lebih awal menjadwal ulang.
    const timer = setTimeout(
      () => setDay(businessDay(Date.now())),
      day.start + DAY_MS - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [day]);
  return useMemo(
    () => ({ date: day.date, label: businessDayLabel(day) }),
    [day],
  );
}
