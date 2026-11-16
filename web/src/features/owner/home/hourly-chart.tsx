import { useMemo } from "react";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiahShort } from "@/shared/lib/money";
import { HealthChart } from "../common/health-chart/health-chart";
import { hourlyBuckets, peakSummary } from "./hourly-chart-geometry";

const TODAY = {
  id: "today",
  name: "Hari ini",
  color: "var(--color-chart-1)",
  nowColor: "var(--color-chart-1-now)",
};

/** Grafik Beranda: omzet per jam hari ini (depan, hijau) di atas {Hari} lalu (belakang, abu). */
export function HourlyChart({
  hourly,
  weekday,
  nowHour,
}: {
  hourly: HourBucket[];
  weekday: string;
  nowHour: number;
}) {
  const { buckets, nowKey } = useMemo(
    () => hourlyBuckets(hourly, nowHour),
    [hourly, nowHour],
  );
  const lastWeekName = `${weekday} lalu`;
  return (
    <HealthChart
      buckets={buckets}
      back={{
        id: "last-week",
        name: lastWeekName,
        color: "var(--color-chart-2)",
      }}
      front={TODAY}
      emphasis="front"
      nowKey={nowKey}
      groupLabel={`Omzet per jam hari ini dan ${lastWeekName}`}
      caption="Omzet per jam"
      keyHeader="Jam"
      summary={peakSummary(hourly, nowHour)}
      peakLabel={formatRupiahShort}
    />
  );
}
