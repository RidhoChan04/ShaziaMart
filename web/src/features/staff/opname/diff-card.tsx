import { Check, Clock, Minus, Plus, Repeat, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type {
  OpnameItemState,
  StaffOpnameItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate, jakartaTime } from "@/shared/lib/business-day";
import { formatQty } from "@/shared/lib/quantity";
import { diffBadgeText, OPNAME_REASON_LABEL } from "@/shared/lib/stock-rules";
import { type ReasonChoice, ReasonPicker } from "./reason-picker";

/** Curah memakai satuannya (`1,5 kg`); selain itu angka eceran saja (`125`). */
const qtyText = (qtyBase: number, item: StaffOpnameItem): string =>
  item.isCurah
    ? formatQty(qtyBase, item.unitSize, item.unitName)
    : formatQty(qtyBase, item.unitSize, "").trimEnd();

const STATUS: Partial<
  Record<OpnameItemState, { label: string; icon: ReactNode; className: string }>
> = {
  disesuaikan: {
    label: "Disesuaikan",
    icon: <Check aria-hidden="true" className="size-4" />,
    className: "text-primary",
  },
  ditahan: {
    label: "Menunggu persetujuan pemilik",
    icon: <Clock aria-hidden="true" className="size-4" />,
    className: "text-warning",
  },
  disetujui: {
    label: "Disetujui pemilik",
    icon: <Check aria-hidden="true" className="size-4" />,
    className: "text-primary",
  },
  dihitung_ulang: {
    label: "Dihitung ulang pemilik",
    icon: <Repeat aria-hidden="true" className="size-4" />,
    className: "text-muted",
  },
  diganti: {
    label: "Diganti hitungan baru",
    icon: <Repeat aria-hidden="true" className="size-4" />,
    className: "text-muted",
  },
};

function DiffBadge({ item }: { item: StaffOpnameItem }) {
  if (item.diffQtyBase === 0) return null;
  const less = item.diffQtyBase < 0;
  const Icon = less ? Minus : Plus;
  return (
    <span
      className={
        less
          ? "inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-[13px] font-semibold text-danger-ink"
          : "inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[13px] font-semibold text-primary"
      }
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {diffBadgeText(item.diffQtyBase, item.unitSize, item.unitName)}
    </span>
  );
}

/** Kartu satu barang selisih: pilih alasan (menunggu_alasan) atau tanda hasil (sudah disimpan). */
export function DiffCard({
  item,
  choice,
  error,
  onChoice,
}: {
  item: StaffOpnameItem;
  choice: ReasonChoice | undefined;
  /** Pesan galat server untuk barang ini. */
  error: string | undefined;
  onChoice: (next: ReasonChoice) => void;
}) {
  const titleId = `kartu-${item.productId}`;
  const status = STATUS[item.state];
  return (
    <section aria-labelledby={titleId} className="grid gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="min-w-0 font-medium">
          {item.productName}
        </h3>
        <DiffBadge item={item} />
      </div>
      <p className="text-[13px] text-muted tabular-nums">
        Sistem {qtyText(item.systemQtyBase, item)} → hitungan{" "}
        {qtyText(item.countedQtyBase, item)}
      </p>
      <p className="text-[13px] text-muted">
        dihitung {jakartaTime(item.countedAt)}
        {item.clockEstimated && (
          <>
            {" · "}
            <span>jam diperkirakan</span>
          </>
        )}
      </p>
      {item.state === "menunggu_alasan" ? (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            Alasan
          </p>
          {error && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-[13px] font-semibold text-danger"
            >
              <TriangleAlert aria-hidden="true" className="size-4" />
              {error === "Pilih alasan" ? "Wajib pilih alasan" : error}
            </p>
          )}
          <ReasonPicker item={item} choice={choice} onChange={onChoice} />
        </div>
      ) : (
        <div className="grid gap-1">
          {status && (
            <p
              className={`flex items-center gap-1.5 text-[14px] font-semibold ${status.className}`}
            >
              {status.icon}
              {status.label}
            </p>
          )}
          {item.reason && (
            <p className="text-[13px] text-muted">
              {OPNAME_REASON_LABEL[item.reason]}
              {item.receiptRef &&
                ` · nota ${item.receiptRef.supplierName} ${formatIsoDate(item.receiptRef.notaDate)}`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
