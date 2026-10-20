import { Minus, Plus, Trash2 } from "lucide-react";
import { type MouseEvent, memo } from "react";
import { cn } from "@/shared/lib/cn";
import { formatAngka } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { type CartLine, useCart } from "../cart/cart-store";
import { cartLineView } from "../cart/cart-view";

type RowProps = {
  line: CartLine;
  index: number;
  selected: boolean;
  lastAdded: boolean;
  onAction: () => void;
};

// memo: mengubah satu baris tidak merender ulang baris lain (objek baris lain tetap sama).
const CartRow = memo(function CartRow({
  line,
  index,
  selected,
  lastAdded,
  onAction,
}: RowProps) {
  const view = cartLineView(line, index);
  const { select, remove, increment, decrement } = useCart.getState();
  const act =
    (fn: (lineId: string) => void) => (e: MouseEvent<HTMLElement>) => {
      // Tombol di dalam baris tidak ikut memicu klik baris (pilih ulang setelah Hapus).
      e.stopPropagation();
      fn(line.lineId);
      onAction();
    };

  return (
    <TableRow
      aria-selected={selected}
      onClick={act(select)}
      className={cn(
        "cursor-pointer text-[15px]",
        lastAdded && "bg-success-soft",
        selected && "shadow-[inset_3px_0_0_var(--color-primary)]",
      )}
    >
      <TableCell className="num w-12 px-3 text-muted">{view.no}</TableCell>
      <TableCell className="w-full whitespace-normal">
        <div className="flex items-center gap-2">
          <span>{line.productName}</span>
          {line.isCurah && (
            <>
              {" "}
              <i className="text-muted">curah</i>
            </>
          )}
          {view.wholesale && (
            <>
              {" "}
              <span className="rounded-sm bg-primary-soft px-1.5 text-xs font-medium text-primary">
                grosir
              </span>
            </>
          )}
          {selected && (
            <Button
              variant="ghost"
              aria-label="Hapus"
              className="ml-auto w-11 px-0 text-danger"
              onClick={act(remove)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="num">
        <div className="flex items-center gap-1">
          {selected && !line.isCurah && (
            <Button
              variant="outline"
              aria-label="Kurangi"
              className="w-11 px-0"
              disabled={line.qtyBase <= line.unitSize}
              onClick={act(decrement)}
            >
              <Minus />
            </Button>
          )}
          <span className="min-w-14">{view.qtyLabel}</span>
          {selected && !line.isCurah && (
            <Button
              variant="outline"
              aria-label="Tambah"
              className="w-11 px-0"
              onClick={act(increment)}
            >
              <Plus />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="num">{view.priceLabel}</TableCell>
      <TableCell className="num px-3 text-right font-bold">
        {formatAngka(view.subtotal)}
      </TableCell>
    </TableRow>
  );
});

export function CartTable({ onAction }: { onAction: () => void }) {
  const lines = useCart((s) => s.lines);
  const selectedLineId = useCart((s) => s.selectedLineId);
  const lastAddedLineId = useCart((s) => s.lastAddedLineId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
      <Table containerClassName="min-h-0 flex-1 overflow-y-auto">
        <TableHeader className="sticky top-0 z-10 bg-surface">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 px-3 text-xs text-muted">NO.</TableHead>
            <TableHead className="h-9 text-xs text-muted">BARANG</TableHead>
            <TableHead className="h-9 text-xs text-muted">QTY</TableHead>
            <TableHead className="h-9 text-xs text-muted">HARGA</TableHead>
            <TableHead className="h-9 px-3 text-right text-xs text-muted">
              SUBTOTAL
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => (
            <CartRow
              key={line.lineId}
              line={line}
              index={i}
              selected={line.lineId === selectedLineId}
              lastAdded={line.lineId === lastAddedLineId}
              onAction={onAction}
            />
          ))}
        </TableBody>
      </Table>
      {lines.length === 0 && (
        <p className="flex flex-1 items-center justify-center p-6 text-muted">
          Belum ada barang di keranjang
        </p>
      )}
    </div>
  );
}
