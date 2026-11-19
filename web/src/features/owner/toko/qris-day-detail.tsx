import {
  Ban,
  CircleCheck,
  CircleDashed,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react";
import { useGetOwnerQrisDay } from "@/shared/api/gen/owner/owner";
import type {
  QrisDay,
  QrisTransaction,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaTime } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

/** `2026-11-18` → `Rab, 18 Nov`. */
export function qrisDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1),
  ).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** `Penjualan Rp692.000 · pelunasan Rp50.000`. */
export const qrisBreakdown = (day: QrisDay): string =>
  `Penjualan ${formatRupiah(day.sales)} · pelunasan ${formatRupiah(day.repayments)}`;

const MARKS: Record<
  QrisDay["status"],
  { label: string; Icon: LucideIcon; tone: string }
> = {
  belum: {
    label: "Belum dicocokkan",
    Icon: CircleDashed,
    tone: "bg-warning-soft text-warning-ink",
  },
  cocok: {
    label: "Cocok",
    Icon: CircleCheck,
    tone: "bg-primary-soft text-primary",
  },
  tidak_cocok: {
    label: "Tidak cocok",
    Icon: TriangleAlert,
    tone: "bg-danger-soft text-danger-ink",
  },
};

/** Tanda pencocokan = ikon + teks; hari ini tidak punya tanda. */
export function QrisStatusMark({ day }: { day: QrisDay }) {
  if (!day.closed) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-muted">
        <CircleDashed aria-hidden="true" className="size-3.5" />
        Hari ini belum selesai
      </span>
    );
  }
  const { label, Icon, tone } = MARKS[day.status];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
          tone,
        )}
      >
        <Icon aria-hidden="true" className="size-3" />
        {label}
      </span>
      {day.changedAfterMark && (
        <span className="text-[13px] font-medium text-warning-ink">
          Total berubah setelah ditandai
        </span>
      )}
    </span>
  );
}

function TransactionRow({ item }: { item: QrisTransaction }) {
  const voided = item.status === "dibatalkan";
  const strike = voided ? "text-muted line-through" : "";
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn("text-base", strike)}>
          {`${jakartaTime(item.at)} · ${item.kind === "penjualan" ? "Penjualan" : "Pelunasan"}`}
        </span>
        <span className={cn("text-[13px] break-words text-muted", strike)}>
          {`${item.ref} · ${item.kasirName}`}
        </span>
        {voided && (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted">
            <Ban aria-hidden="true" className="size-3.5" />
            Dibatalkan
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 text-[15px] font-semibold tabular-nums",
          strike,
        )}
      >
        {formatRupiah(item.amount)}
      </span>
    </li>
  );
}

/** Lembar daftar transaksi QRIS satu hari (S11), urut jam; yang dibatalkan dicoret. */
export function QrisDayDetail({
  date,
  open,
  onClose,
}: {
  date: string;
  open: boolean;
  onClose: () => void;
}) {
  const query = useGetOwnerQrisDay(date, { query: { enabled: open } });
  const day = query.data;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">
          Transaksi QRIS
        </SheetTitle>
        <SheetDescription>
          {day
            ? `${qrisDayLabel(date)} · Total ${formatRupiah(day.total)}`
            : qrisDayLabel(date)}
        </SheetDescription>
        {query.isError ? (
          <div role="alert" className="grid gap-2 text-sm text-danger">
            {pesanError(query.error)}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : day === undefined ? (
          <p className="text-sm text-muted">Memuat…</p>
        ) : day.items.length === 0 ? (
          <p className="text-sm text-muted">
            Tidak ada transaksi QRIS pada hari ini.
          </p>
        ) : (
          <ul
            // biome-ignore lint/a11y/noRedundantRoles: Safari/VoiceOver membuang semantik daftar bila list-style none
            role="list"
            aria-label="Transaksi QRIS"
            className="divide-y divide-border overflow-hidden rounded-lg bg-bg"
          >
            {day.items.map((item) => (
              <TransactionRow
                key={`${item.at}-${item.kind}-${item.ref}`}
                item={item}
              />
            ))}
          </ul>
        )}
        <SheetClose asChild>
          <Button variant="outline" className="h-12 w-full text-[17px]">
            Tutup
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
