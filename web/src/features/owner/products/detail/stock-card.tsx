import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import { productBadges } from "../product-model";
import { StatusBadge } from "../status-badge";
import { MovementRow, MovementsSheet } from "./movements-sheet";
import { RowList, Section } from "./section";

export function StockCard({ product }: { product: OwnerProduct }) {
  const eceran = product.units[0];
  if (!eceran) return null;
  const unit = { name: eceran.name, size: eceran.unitSize };
  // Menipis/Minus ditampilkan di sini, bersama angkanya; tanda lain ada di kepala halaman.
  const alerts = productBadges(product).filter(
    (b) => b.key === "minus" || b.key === "menipis",
  );
  const now = Date.now();
  return (
    <Section title="Stok">
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        <div className="grid content-start justify-items-start gap-1">
          <span className="text-[13px] text-muted">Stok sekarang</span>
          <b className="text-[22px] leading-tight tabular-nums">
            {product.stockCounted
              ? formatQty(product.stock, unit.size, unit.name)
              : "—"}
          </b>
          {alerts.map((b) => (
            <StatusBadge key={b.key} badge={b} />
          ))}
        </div>
        <div className="grid content-start justify-items-start gap-1">
          <span className="text-[13px] text-muted">Batas menipis</span>
          <b className="text-[22px] leading-tight tabular-nums">
            {product.minStock === null
              ? "—"
              : formatQty(product.minStock, unit.size, unit.name)}
          </b>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <span className="text-[15px]">HPP rata-rata</span>
        <b className="tabular-nums">
          {eceran.cost === null ? (
            <span className="font-normal text-muted">Belum diisi</span>
          ) : (
            <>
              {formatRupiah(eceran.cost)}
              <span className="font-normal text-muted"> /{unit.name}</span>
            </>
          )}
        </b>
      </div>
      <div className="flex items-center justify-between border-t border-border pr-2 pl-4">
        <h3 className="py-3 text-[15px] font-semibold">Riwayat stok</h3>
        {product.recentMovements.length > 0 && (
          <MovementsSheet productId={product.id} unit={unit} />
        )}
      </div>
      {product.recentMovements.length === 0 ? (
        <p className="px-4 pb-3 text-[15px] text-muted">Belum ada penjualan</p>
      ) : (
        <RowList>
          {product.recentMovements.map((m) => (
            <MovementRow key={m.id} movement={m} unit={unit} now={now} />
          ))}
        </RowList>
      )}
    </Section>
  );
}
