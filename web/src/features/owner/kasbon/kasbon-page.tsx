import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useListOwnerCustomers } from "@/shared/api/gen/owner/owner";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { FitAmount } from "../common/fit-amount";
import { RowList, Section } from "../products/detail/section";
import { AgeBadge } from "./age-badge";
import { CustomerRow } from "./customer-row";
import { AGE_LABEL, visibleCustomers } from "./kasbon-model";

/** Tab Kasbon: total, tiga kelompok umur, lalu pelanggan urut sisa terbesar. Semua angka dari server. */
export function KasbonPage() {
  const query = useListOwnerCustomers();
  const data = query.data;
  const [text, setText] = useState("");
  const deferred = useDeferredValue(text);
  const visible = useMemo(
    () => (data ? visibleCustomers(data.customers, deferred) : []),
    [data, deferred],
  );

  if (!data) {
    return query.isError ? (
      <div className="grid justify-items-start gap-3">
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(query.error)}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Coba lagi
        </Button>
      </div>
    ) : (
      <p role="status" className="text-muted">
        Memuat…
      </p>
    );
  }

  const searching = deferred.trim() !== "";
  return (
    <div className="grid gap-4 lg:max-w-2xl">
      <section aria-label="Ringkasan kasbon" className="grid gap-3">
        <div className="rounded-lg bg-surface p-4">
          <p className="text-[13px] font-semibold text-muted">Total kasbon</p>
          <FitAmount
            text={formatRupiah(data.totalBalance)}
            max={34}
            min={20}
            className="font-bold tracking-[-0.02em]"
          />
          <p className="mt-1 text-[13px] text-muted">{`${data.debtorCount} pelanggan`}</p>
        </div>
        <div className="overflow-hidden rounded-lg bg-surface">
          <RowList>
            {data.ages.map((g) => (
              <li
                key={g.age}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-base">{AGE_LABEL[g.age]}</span>
                  {g.age === "lebih_30_hari" && g.count > 0 ? (
                    <span>
                      <AgeBadge text={`${g.count} pelanggan`} />
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted">{`${g.count} pelanggan`}</span>
                  )}
                </span>
                <span className="w-[42%] shrink-0 text-right font-semibold tabular-nums">
                  <FitAmount text={formatRupiah(g.total)} max={16} min={12} />
                </span>
              </li>
            ))}
          </RowList>
        </div>
      </section>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          aria-label="Cari nama atau nomor HP"
          placeholder="Cari nama atau nomor HP"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 w-full rounded-full bg-surface pr-4 pl-9 text-base shadow-sm outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
          {searching ? "Tidak ada pelanggan yang cocok" : "Belum ada kasbon"}
        </p>
      ) : (
        <Section title="Pelanggan" trailing="urut sisa terbesar">
          <RowList>
            {visible.map((c) => (
              <CustomerRow key={c.id} customer={c} />
            ))}
          </RowList>
        </Section>
      )}
    </div>
  );
}
