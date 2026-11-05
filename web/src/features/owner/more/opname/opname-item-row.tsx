import { Link } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import type { OwnerOpnameItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  formatIsoDayMonth,
  jakartaTime,
  relativeDayTime,
} from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import { diffBadgeText, OPNAME_REASON_LABEL } from "@/shared/lib/stock-rules";
import { Button } from "@/shared/ui/button";
import { effectiveCount } from "./opname-model";

function DiffBadge({
  diffQtyBase,
  item,
}: {
  diffQtyBase: number;
  item: OwnerOpnameItem;
}) {
  if (diffQtyBase === 0) return null;
  const loss = diffQtyBase < 0;
  const Icon = loss ? Minus : Plus;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
        loss ? "bg-danger-soft text-danger-ink" : "bg-primary-soft text-primary"
      }`}
    >
      <Icon aria-hidden="true" className="size-3" />
      {diffBadgeText(diffQtyBase, item.unitSize, item.unitName)}
    </span>
  );
}

/**
 * `Disetujui {nama} · Hari ini 14.05` · `Dihitung ulang: 48 pcs · ...` · `Diganti hitungan baru`;
 * hitungan tertahan yang diganti tetap memperlihatkan nilai dan penggantinya (I2).
 */
function statusText(item: OwnerOpnameItem, now: number): string | null {
  const when =
    item.resolvedAt === null
      ? ""
      : ` · ${relativeDayTime(item.resolvedAt, now)}`;
  switch (item.state) {
    case "disetujui":
      return `Disetujui ${item.resolvedByName ?? "pemilik"}${when}`;
    case "dihitung_ulang":
      return item.recount
        ? `Dihitung ulang: ${formatQty(item.recount.countedQtyBase, item.unitSize, item.unitName)}${when}`
        : null;
    case "diganti":
      return item.replacedByName === null
        ? "Diganti hitungan baru"
        : `Diganti hitungan baru · ${item.value === null ? "HPP belum ada" : formatRupiah(item.value)} · oleh ${item.replacedByName}`;
    default:
      return null;
  }
}

/** `{alasan} · nota {supplier} {d Mmm} · dihitung 10.00 · jam diperkirakan`. */
function detailText(item: OwnerOpnameItem): string {
  const parts: string[] = [];
  if (item.reason !== null) {
    const ref = item.receiptRef;
    parts.push(
      OPNAME_REASON_LABEL[item.reason] +
        (ref
          ? ` · nota ${ref.supplierName} ${formatIsoDayMonth(ref.notaDate)}`
          : ""),
    );
  }
  parts.push(`dihitung ${jakartaTime(item.countedAt)}`);
  if (item.clockEstimated) parts.push("jam diperkirakan");
  return parts.join(" · ");
}

/** Satu barang di detail sesi: sistem -> hitungan, tanda kurang/lebih, nilai rupiah, alasan, dan aksi bila ditahan. */
export function OpnameItemRow({
  item,
  now,
  busy,
  onApprove,
  onRecount,
}: {
  item: OwnerOpnameItem;
  now: number;
  busy: boolean;
  onApprove: (item: OwnerOpnameItem, opener: HTMLButtonElement) => void;
  onRecount: (item: OwnerOpnameItem, opener: HTMLButtonElement) => void;
}) {
  const c = effectiveCount(item);
  const status = statusText(item, now);
  // Barang yang diganti tidak masuk total (K26): hanya statusnya yang tampil.
  const hasDiff = c.diffQtyBase !== 0 && item.state !== "diganti";
  const replacedBy =
    item.replacedByName !== null ? item.replacedBySessionId : null;
  return (
    <li className="grid gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-base font-semibold">{item.productName}</span>
          <span className="text-[13px] text-muted">
            {`Sistem ${formatQty(c.systemQtyBase, item.unitSize, item.unitName)} → hitungan ${formatQty(c.countedQtyBase, item.unitSize, item.unitName)}`}
          </span>
        </div>
        {hasDiff && (
          <span className="shrink-0 text-right font-semibold tabular-nums">
            {c.value === null ? (
              <span className="text-[15px] text-warning-ink">
                HPP belum ada
              </span>
            ) : (
              formatRupiah(c.value)
            )}
          </span>
        )}
      </div>
      {(hasDiff || status) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DiffBadge diffQtyBase={hasDiff ? c.diffQtyBase : 0} item={item} />
          {status && (
            <span className="text-[13px] font-semibold text-primary">
              {status}
            </span>
          )}
        </div>
      )}
      {replacedBy && (
        <Link
          to="/owner/lainnya/opname/$sessionId"
          params={{ sessionId: replacedBy }}
          className="inline-flex min-h-11 items-center justify-self-start text-[15px] font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Lihat hitungan baru
        </Link>
      )}
      {hasDiff && <p className="text-[13px] text-muted">{detailText(item)}</p>}
      {!hasDiff && item.state !== "diganti" && (
        <p className="text-[13px] text-muted">{`dihitung ${jakartaTime(item.countedAt)}`}</p>
      )}
      {item.state === "ditahan" && (
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={busy}
            aria-label={`Setujui ${item.productName}`}
            onClick={(e) => onApprove(item, e.currentTarget)}
          >
            Setujui
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            aria-label={`Hitung ulang ${item.productName}`}
            onClick={(e) => onRecount(item, e.currentTarget)}
          >
            Hitung ulang
          </Button>
        </div>
      )}
    </li>
  );
}
