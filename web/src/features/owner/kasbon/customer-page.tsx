import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
  getGetOwnerCustomerQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerCustomersQueryKey,
  useGetOwnerCustomer,
} from "@/shared/api/gen/owner/owner";
import type { OwnerCustomer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { FitAmount } from "../common/fit-amount";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList, Section } from "../products/detail/section";
import { CancelPaymentSheet } from "./cancel-payment-sheet";
import { HistoryRow } from "./history-row";
import { LimitSheet } from "./limit-sheet";
import { OwnerPaymentSheet } from "./owner-payment-sheet";

const BACK = { label: "Kasbon", fallback: "/owner/kasbon" } as const;

/** Kartu ringkasan: Sisa kasbon (+ umur), saldo 0 hanya Limit, saldo < 0 `Lebih bayar` (Q8). Semua angka dari server. */
function SummaryCard({ customer }: { customer: OwnerCustomer }) {
  const { balance, ageDays } = customer;
  const limit = `Limit ${formatRupiah(customer.creditLimit)}`;
  return (
    <section
      aria-label="Ringkasan pelanggan"
      className="rounded-lg bg-surface p-4"
    >
      {balance !== 0 && (
        <>
          <p className="text-[13px] font-semibold text-muted">
            {balance > 0 ? "Sisa kasbon" : "Lebih bayar"}
          </p>
          <FitAmount
            text={formatRupiah(Math.abs(balance))}
            max={34}
            min={20}
            className="font-bold tracking-[-0.02em]"
          />
        </>
      )}
      <p
        className={
          balance === 0
            ? "text-[17px] font-semibold"
            : "mt-1 text-[13px] text-muted"
        }
      >
        {balance > 0 && ageDays !== null
          ? `${limit} · kasbon tertua ${ageDays} hari`
          : limit}
      </p>
    </section>
  );
}

/** Detail pelanggan: kartu sisa kasbon, `Catat pelunasan` / `Atur limit`, dan riwayat terbaru dulu. */
export function CustomerPage() {
  const { customerId } = useParams({ from: "/owner/kasbon/$customerId" });
  const client = useQueryClient();
  const query = useGetOwnerCustomer(customerId);
  // Hanya id yang disimpan: lembar batal selalu memakai baris terbaru dari data yang dimuat ulang.
  const [targetId, setTargetId] = useState<string | null>(null);

  if (!query.data) {
    return query.isError ? (
      <div className="grid justify-items-start gap-3 pt-6">
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(query.error)}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Coba lagi
        </Button>
      </div>
    ) : (
      <p role="status" className="pt-6 text-muted">
        Memuat…
      </p>
    );
  }

  const customer = query.data;
  // Hasil mutasi memuat detail terbaru; daftar kasbon dan Beranda ikut dimuat ulang.
  const refresh = (saved: OwnerCustomer) => {
    client.setQueryData(getGetOwnerCustomerQueryKey(customerId), saved);
    void client.invalidateQueries({
      queryKey: getListOwnerCustomersQueryKey(),
    });
    void client.invalidateQueries({
      queryKey: getGetOwnerTodaySummaryQueryKey(),
    });
  };
  const now = Date.now();
  const target = customer.history.find((e) => e.id === targetId) ?? null;

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title={customer.name}
        eyebrow={customer.phone}
        back={BACK}
      />
      <div className="grid gap-5 lg:max-w-2xl">
        <SummaryCard customer={customer} />
        <div className="flex gap-3">
          <OwnerPaymentSheet
            key={customer.id}
            customer={customer}
            onSaved={refresh}
          />
          <LimitSheet customer={customer} onSaved={refresh} />
        </div>
        <Section title="Riwayat">
          {customer.history.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">
              Belum ada riwayat
            </p>
          ) : (
            <RowList>
              {customer.history.map((entry) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  onOpen={(e) => setTargetId(e.id)}
                />
              ))}
            </RowList>
          )}
        </Section>
      </div>
      <CancelPaymentSheet
        entry={target}
        customer={customer}
        onDone={refresh}
        onClose={() => setTargetId(null)}
      />
    </div>
  );
}
