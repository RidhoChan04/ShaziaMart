const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

const dayFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

/** "10.05" (Asia/Jakarta). */
export const clockLabel = (ms: number) =>
  timeFormat.format(ms).replace(":", ".");

/** "4 Nov 13.05" (Asia/Jakarta). */
export const dayClockLabel = (ms: number) =>
  `${dayFormat.format(ms)} ${clockLabel(ms)}`;

/** Tanda kecil di baris Riwayat. */
export const BADGE =
  "rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger";
