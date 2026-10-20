import { useMemo, useState } from "react";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import type { Customer, Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useCart } from "../cart/cart-store";
import { cartSummary } from "../cart/cart-view";
import { CampuranFields } from "./campuran-tab";
import { KasbonFields } from "./kasbon-tab";
import {
  type FirstMethod,
  type PaymentDraft,
  paymentState,
} from "./payment-model";
import { QrisPanel } from "./qris-tab";
import { SalePrompts } from "./sale-prompts";
import { CashFields } from "./tunai-tab";
import { useSubmitSale } from "./use-submit-sale";

type Tab = PaymentDraft["kind"];

const TABS: { value: Tab; label: string }[] = [
  { value: "tunai", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "kasbon", label: "Kasbon" },
  { value: "campuran", label: "Campuran" },
];

type Fields = {
  received: string;
  customer: Customer | null;
  firstMethod: FirstMethod;
  firstAmount: string;
  mixReceived: string;
};

const EMPTY: Fields = {
  received: "",
  customer: null,
  firstMethod: "cash",
  firstAmount: "",
  mixReceived: "",
};

function draftOf(tab: Tab, f: Fields): PaymentDraft {
  const customerId = f.customer?.id ?? null;
  switch (tab) {
    case "tunai":
      return { kind: "tunai", received: f.received };
    case "qris":
      return { kind: "qris" };
    case "kasbon":
      return { kind: "kasbon", customerId };
    case "campuran":
      return {
        kind: "campuran",
        firstMethod: f.firstMethod,
        firstAmount: f.firstAmount,
        received: f.mixReceived,
        customerId,
      };
  }
}

const tabTrigger =
  "h-11 flex-none border-border px-4 text-[15px] data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground";

// Isi tab menggulir sendiri agar total & Selesai tetap terlihat di layar 768px.
const tabBody = "-mx-1 min-h-0 overflow-y-auto px-1 pb-1";

type Props = { onClose: () => void; onPaid: (sale: Sale) => void };

function PaymentSession({ onClose, onPaid }: Props) {
  const lines = useCart((s) => s.lines);
  const printReceipt = useCart((s) => s.printReceipt);
  const settings = useGetKasirSettings({ query: { staleTime: 60_000 } }).data;
  const { online } = useServerHealth();
  const print = printReceipt ?? settings?.autoPrint ?? false;
  const { itemCount, total } = useMemo(() => cartSummary(lines), [lines]);
  const [tab, setTab] = useState<Tab>("tunai");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const set = (patch: Partial<Fields>) =>
    setFields((f) => ({ ...f, ...patch }));
  const state = paymentState(total, draftOf(tab, fields));
  const sale = useSubmitSale(onPaid);
  const busy = sale.pending;
  const canSubmit = state.canSubmit && !busy && online;

  function submit() {
    if (canSubmit && state.choice) sale.submit(state.choice, print);
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <DialogContent
          className="max-w-[520px] gap-0 overflow-hidden p-0 sm:max-w-[520px]"
          showCloseButton={!busy}
          onOpenAutoFocus={(e) => {
            // Fokus ke UANG DITERIMA, bukan tab pertama.
            e.preventDefault();
            (e.currentTarget as HTMLElement)
              .querySelector<HTMLInputElement>("input")
              ?.focus();
          }}
        >
          <form
            className="flex max-h-[calc(100dvh-2rem)] flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader className="flex-row items-baseline justify-between border-b border-border py-3.5 pr-12 pl-[18px]">
              <DialogTitle className="sr-only">Pembayaran</DialogTitle>
              <DialogDescription>{`TOTAL BELANJA · ${itemCount} barang`}</DialogDescription>
              <span className="text-2xl font-bold tabular-nums">
                {formatRupiah(total)}
              </span>
            </DialogHeader>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as Tab)}
              className="min-h-0 flex-1 gap-3 px-[18px] pt-3"
            >
              <TabsList className="h-auto gap-1.5 bg-transparent p-0">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className={tabTrigger}
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="tunai" className={tabBody}>
                <CashFields
                  due={total}
                  text={fields.received}
                  onText={(received) => set({ received })}
                  change={state.change}
                  shortage={state.shortage}
                />
              </TabsContent>
              <TabsContent value="qris" className={tabBody}>
                <QrisPanel amount={total} />
              </TabsContent>
              <TabsContent value="kasbon" className={tabBody}>
                <KasbonFields
                  credit={total}
                  customer={fields.customer}
                  onCustomer={(customer) => set({ customer })}
                />
              </TabsContent>
              <TabsContent value="campuran" className={tabBody}>
                <CampuranFields
                  total={total}
                  firstMethod={fields.firstMethod}
                  onFirstMethod={(firstMethod) => set({ firstMethod })}
                  firstAmount={fields.firstAmount}
                  onFirstAmount={(firstAmount) => set({ firstAmount })}
                  received={fields.mixReceived}
                  onReceived={(mixReceived) => set({ mixReceived })}
                  customer={fields.customer}
                  onCustomer={(customer) => set({ customer })}
                  change={state.change}
                  shortage={state.shortage}
                />
              </TabsContent>
            </Tabs>
            <div className="grid gap-2 border-t border-border px-[18px] pt-3 pb-[18px]">
              {sale.error && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {sale.error}
                </p>
              )}
              {sale.notice && (
                <p role="status" className="text-sm font-medium text-warning">
                  {sale.notice}
                </p>
              )}
              <div className="flex items-center justify-between">
                <label className="flex h-11 cursor-pointer items-center gap-2 text-muted">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={print}
                    onChange={(e) =>
                      useCart.getState().setPrintReceipt(e.target.checked)
                    }
                  />
                  Cetak struk
                </label>
                {!online && !sale.error && (
                  <p
                    role="status"
                    className="ml-auto pr-3 text-sm font-medium text-danger"
                  >
                    Server tidak tersambung — coba lagi
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="px-7 font-bold"
                  disabled={!canSubmit}
                  aria-busy={busy}
                >
                  {tab === "qris" ? "Sudah masuk" : "Selesai"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <SalePrompts
        sale={sale}
        lines={lines}
        rechoose={() =>
          paymentState(
            cartSummary(useCart.getState().lines).total,
            draftOf(tab, fields),
          ).choice
        }
      />
    </>
  );
}

/** Jendela bayar: Tunai, QRIS, Kasbon, Campuran. Tertutup saat request berjalan tidak bisa. */
export function PaymentDialog({ open, ...props }: Props & { open: boolean }) {
  return open ? <PaymentSession {...props} /> : null;
}
