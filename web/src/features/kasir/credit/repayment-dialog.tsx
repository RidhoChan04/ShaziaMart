import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import type {
  Customer,
  KasirCreditPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { newId } from "@/shared/lib/id";
import { formatAngka, formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { CustomerPicker } from "../payment/customer-picker";
import { QrisPanel } from "../payment/qris-tab";
import { CashFields, ChangeLine, MoneyField } from "../payment/tunai-tab";
import { focusScanBox } from "../scan/scan-box";
import {
  type RepaymentDraft,
  repaymentState,
  toRepaymentInput,
} from "./repayment-model";
import { useSubmitRepayment } from "./use-submit-repayment";

type Method = RepaymentDraft["method"];

const TABS: { value: Method; label: string }[] = [
  { value: "tunai", label: "Tunai" },
  { value: "qris", label: "QRIS" },
];

const tabTrigger =
  "h-11 flex-none border-border px-4 text-[15px] data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground";

const EMPTY: RepaymentDraft = {
  customer: null,
  amount: "",
  method: "tunai",
  received: "",
};

function balanceAfterText(balanceAfter: number) {
  return balanceAfter === 0 ? "Rp0 · lunas" : formatRupiah(balanceAfter);
}

function Saved({
  payment,
  notice,
  onClose,
}: {
  payment: KasirCreditPayment;
  notice: string | null;
  onClose: () => void;
}) {
  return (
    <form
      className="grid gap-3 p-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CircleCheck
            aria-hidden="true"
            className="size-5 shrink-0 text-primary"
          />
          Pelunasan tersimpan
        </DialogTitle>
        <DialogDescription className="tabular-nums">
          {`${payment.customerName} · ${formatRupiah(payment.amount)}`}
        </DialogDescription>
      </DialogHeader>
      {notice && (
        <p
          role="status"
          className="flex items-center gap-1.5 text-sm font-medium text-warning-ink"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {notice}
        </p>
      )}
      {payment.method === "tunai" && payment.change > 0 && (
        <ChangeLine change={payment.change} shortage={null} />
      )}
      <p className="text-lg font-semibold tabular-nums">
        {`Sisa kasbon ${formatRupiah(payment.balanceAfter)}`}
      </p>
      <Button type="submit" size="lg" className="font-bold" autoFocus>
        Tutup
      </Button>
    </form>
  );
}

function RepaymentSession({ onClose }: { onClose: () => void }) {
  // Id dibuat sekali saat lembar dibuka: kirim ulang memakai id yang sama.
  const [id] = useState(() => newId());
  const [draft, setDraft] = useState<RepaymentDraft>(EMPTY);
  const [printChoice, setPrintChoice] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<KasirCreditPayment | null>(null);
  const settings = useGetKasirSettings({ query: { staleTime: 60_000 } }).data;
  const { online } = useServerHealth();
  const print = printChoice ?? settings?.autoPrint ?? false;
  const set = (patch: Partial<RepaymentDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const state = repaymentState(draft);
  const repayment = useSubmitRepayment(setSaved);
  const busy = repayment.pending;
  const canSubmit = state.canSubmit && !busy && online;
  const customer: Customer | null = draft.customer;

  function submit() {
    if (!canSubmit) return;
    repayment.submit(toRepaymentInput(id, draft, state, print));
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-[520px] gap-0 overflow-hidden p-0 sm:max-w-[520px]"
        showCloseButton={!busy && saved === null}
        onCloseAutoFocus={(e) => {
          // Fokus kembali ke kolom scan, bukan ke tombol pemicu.
          e.preventDefault();
          focusScanBox();
        }}
        onOpenAutoFocus={(e) => {
          // Fokus ke kolom cari pelanggan.
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLElement>("input")
            ?.focus();
        }}
      >
        {saved ? (
          <Saved payment={saved} notice={repayment.notice} onClose={onClose} />
        ) : (
          <form
            className="flex max-h-[calc(100dvh-2rem)] flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader className="flex-row items-baseline justify-between border-b border-border py-3.5 pr-12 pl-[18px]">
              <DialogTitle>Pelunasan kasbon</DialogTitle>
              <DialogDescription>Esc untuk menutup</DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-[18px] pt-3 pb-3">
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted">
                  PELANGGAN
                </span>
                <CustomerPicker
                  mode="pelunasan"
                  value={customer}
                  onChange={(c) =>
                    set({ customer: c, amount: "", received: "" })
                  }
                />
              </div>
              {customer && (
                <>
                  <div className="grid gap-1">
                    <MoneyField
                      label="NOMINAL PELUNASAN"
                      value={draft.amount}
                      onChange={(amount) => set({ amount })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-self-start"
                      onClick={() =>
                        set({ amount: formatAngka(customer.balance) })
                      }
                    >
                      Lunas semua
                    </Button>
                  </div>
                  {state.problem && (
                    <p
                      role="alert"
                      className="flex items-center gap-1.5 text-sm font-medium text-warning-ink"
                    >
                      <TriangleAlert
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      {state.problem}
                    </p>
                  )}
                  <Tabs
                    value={draft.method}
                    onValueChange={(v) => set({ method: v as Method })}
                    className="gap-3"
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
                    <TabsContent value="tunai">
                      <CashFields
                        due={state.amount}
                        text={draft.received}
                        onText={(received) => set({ received })}
                        change={state.change}
                        shortage={state.shortage}
                      />
                    </TabsContent>
                    <TabsContent value="qris">
                      {state.amount !== null && (
                        <QrisPanel amount={state.amount} />
                      )}
                    </TabsContent>
                  </Tabs>
                  {state.balanceAfter !== null && (
                    <p className="font-semibold tabular-nums">
                      {`Sisa kasbon setelah ini ${balanceAfterText(state.balanceAfter)}`}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="grid gap-2 border-t border-border px-[18px] pt-3 pb-[18px]">
              {repayment.error && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {repayment.error}
                </p>
              )}
              {repayment.notice && (
                <p
                  role="status"
                  className="flex items-center gap-1.5 text-sm font-medium text-warning-ink"
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  {repayment.notice}
                </p>
              )}
              {!online && !repayment.error && (
                <p role="status" className="text-sm font-medium text-danger">
                  Server tidak tersambung — coba lagi
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <label className="flex h-11 cursor-pointer items-center gap-2 text-muted">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={print}
                    onChange={(e) => setPrintChoice(e.target.checked)}
                  />
                  Cetak struk
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={busy}
                    onClick={onClose}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="px-7 font-bold"
                    disabled={!canSubmit}
                    aria-busy={busy}
                  >
                    {draft.method === "qris"
                      ? "Sudah masuk"
                      : "Simpan pelunasan"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lembar Pelunasan kasbon (kasir): Tunai atau QRIS; hasil tampil sampai Tutup. */
export function RepaymentDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return open ? <RepaymentSession onClose={onClose} /> : null;
}
