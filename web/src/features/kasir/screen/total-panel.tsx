import { useMemo } from "react";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { useCart } from "../cart/cart-store";
import { cartSummary } from "../cart/cart-view";
import { HeldCartsSheet } from "./held-carts-sheet";

export function TotalPanel({
  payOpen,
  onPay,
  onAction,
}: {
  payOpen: boolean;
  onPay: () => void;
  onAction: () => void;
}) {
  const lines = useCart((s) => s.lines);
  const lastChange = useCart((s) => s.lastChange);
  const printReceipt = useCart((s) => s.printReceipt);
  const { itemCount, total } = useMemo(() => cartSummary(lines), [lines]);
  const settings = useGetKasirSettings({ query: { staleTime: 60_000 } }).data;
  const { online } = useServerHealth();
  const print = printReceipt ?? settings?.autoPrint ?? false;
  const empty = lines.length === 0;

  return (
    <aside
      aria-label="Total"
      className="flex w-[300px] shrink-0 flex-col gap-2"
    >
      <div className="rounded-md border border-border bg-surface p-3">
        <p className="text-xs text-muted">{itemCount} BARANG · TOTAL</p>
        <p className="num text-[30px] leading-tight font-bold tracking-tight">
          {formatRupiah(total)}
        </p>
      </div>
      {lastChange !== null && (
        <output className="block rounded-md border border-primary bg-primary-soft p-3">
          <span className="block text-xs text-primary">KEMBALIAN</span>
          <span className="num block text-[32px] leading-tight font-bold text-primary">
            {formatRupiah(lastChange)}
          </span>
        </output>
      )}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2">
        <label className="flex h-11 cursor-pointer items-center gap-2 px-1">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={print}
            onChange={(e) => {
              useCart.getState().setPrintReceipt(e.target.checked);
              onAction();
            }}
          />
          Cetak struk
        </label>
        <Button
          variant="outline"
          disabled={empty}
          onClick={() => {
            useCart.getState().hold();
            onAction();
          }}
        >
          Tahan transaksi
        </Button>
        <HeldCartsSheet onClose={onAction} />
      </div>
      <Button
        size="lg"
        className="mt-auto"
        aria-haspopup="dialog"
        aria-expanded={payOpen}
        disabled={empty || !online}
        onClick={onPay}
      >
        Bayar
      </Button>
    </aside>
  );
}
