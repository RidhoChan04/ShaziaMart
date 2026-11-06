import { Undo2 } from "lucide-react";
import type {
  CreditHistoryEntry,
  CreditPaymentInfo,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  businessDay,
  formatIsoDayMonth,
  jakartaIsoDate,
  jakartaTime,
  relativeDayTime,
} from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import { CREDIT_METHOD_LABEL } from "@/shared/lib/credit-rules";
import { formatRupiah } from "@/shared/lib/money";
import { FitAmount } from "../common/fit-amount";

const WEEKDAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;

/** `5 Nov 14.32` (tanggal dan jam dinding Asia/Jakarta). */
export const dayTime = (ms: number): string =>
  `${formatIsoDayMonth(jakartaIsoDate(ms))} ${jakartaTime(ms)}`;

/** `Rab, 4 Nov 14.32`. */
const weekdayTime = (ms: number): string =>
  `${WEEKDAY[businessDay(ms).weekday]}, ${dayTime(ms)}`;

/** `Tunai di kasir`, `Transfer ke pemilik`; Tunai ke pemilik sudah memuat tujuannya. */
export function paymentLabel(payment: CreditPaymentInfo): string {
  const method = CREDIT_METHOD_LABEL[payment.method];
  if (payment.channel === "kasir") return `${method} di kasir`;
  return payment.method === "titip" ? method : `${method} ke pemilik`;
}

/** Pelunasan aktif yang boleh dibatalkan pemilik dari app ini (bukan di shift yang masih buka). */
export const canCancel = (entry: CreditHistoryEntry): boolean =>
  entry.kind === "pelunasan" &&
  entry.payment !== null &&
  entry.cancelled === null &&
  !entry.payment.inOpenShift;

const rowClass = "grid gap-0.5 px-4 py-2";

function RowBody({ entry, now }: { entry: CreditHistoryEntry; now: number }) {
  const { payment, cancelled } = entry;
  const kasbon = entry.kind === "kasbon";
  const heading = kasbon
    ? entry.saleNumber
      ? `Kasbon · struk ${entry.saleNumber}`
      : "Kasbon"
    : `Pelunasan · ${payment ? paymentLabel(payment) : ""}`;
  const who = kasbon ? entry.kasirName : (payment?.byName ?? null);
  const struck = cancelled !== null;
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "min-w-0 flex-1 text-[17px] leading-snug font-semibold",
            struck && "text-muted line-through",
          )}
        >
          {heading}
        </span>
        {/* Lebar kolom tetap dari persentase baris: ukuran huruf tidak bergantung pada isinya sendiri. */}
        <span className="w-[40%] shrink-0 text-right font-semibold tabular-nums">
          <FitAmount
            text={`${kasbon ? "+" : "−"}${formatRupiah(entry.amount)}`}
            max={17}
            min={12}
            className={cn(struck && "text-muted line-through")}
          />
        </span>
      </span>
      <span className="text-[13px] whitespace-nowrap text-muted">
        {who ? `${weekdayTime(entry.at)} · ${who}` : weekdayTime(entry.at)}
      </span>
      {cancelled && (
        <span className="grid justify-items-start gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-muted">
            <Undo2 aria-hidden="true" className="size-3" />
            Dibatalkan
          </span>
          <span className="text-[13px] text-muted">
            {`${cancelled.reason} · ${cancelled.byName} · ${relativeDayTime(cancelled.at, now)}`}
          </span>
        </span>
      )}
      {payment?.inOpenShift && cancelled === null && (
        <span className="text-[13px] text-muted">
          Masih di shift yang buka — batalkan dari kasir
        </span>
      )}
    </>
  );
}

/**
 * Satu baris riwayat pelanggan. Pelunasan aktif yang boleh dibatalkan pemilik adalah tombol
 * (membuka lembar batal); kasbon, baris dibatalkan, dan pelunasan shift buka hanya teks.
 */
export function HistoryRow({
  entry,
  now,
  onOpen,
}: {
  entry: CreditHistoryEntry;
  now: number;
  onOpen: (entry: CreditHistoryEntry) => void;
}) {
  if (canCancel(entry)) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onOpen(entry)}
          className={cn(
            rowClass,
            "min-h-14 w-full text-left hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          )}
        >
          <RowBody entry={entry} now={now} />
        </button>
      </li>
    );
  }
  return (
    <li className={cn(rowClass, "min-h-14")}>
      <RowBody entry={entry} now={now} />
    </li>
  );
}
