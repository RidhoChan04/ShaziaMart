import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useListOwnerSales } from "@/shared/api/gen/owner/owner";
import type { OwnerSaleRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  addIsoDays,
  jakartaIsoDate,
  jakartaTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { RowList } from "../../products/detail/section";
import { ReceiptBadgeView } from "../receipts/receipt-badge";
import { effectiveDate, saleDayLabel } from "./sales-model";

const rowClass =
  "flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";
const stepClass =
  "grid size-12 shrink-0 place-items-center text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary";

function SaleRow({ sale }: { sale: OwnerSaleRow }) {
  const voided = sale.status === "dibatalkan";
  const strike = voided ? "text-muted line-through" : "";
  return (
    <li>
      <Link
        to="/owner/lainnya/transaksi/$saleId"
        params={{ saleId: sale.id }}
        className={rowClass}
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`min-w-0 text-base break-words ${strike}`}>
              {`${sale.number} · ${jakartaTime(sale.createdAt)}`}
            </span>
            <span
              className={`shrink-0 text-[15px] font-semibold tabular-nums ${strike}`}
            >
              {formatRupiah(sale.total)}
            </span>
          </span>
          <span className="flex items-center justify-between gap-3 text-[13px] text-muted">
            <span className="min-w-0">{`${sale.methodLabel} · ${sale.kasirName}`}</span>
            {voided && (
              <ReceiptBadgeView
                badge={{ label: "Dibatalkan", tone: "neutral" }}
              />
            )}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </Link>
    </li>
  );
}

/** Lainnya > Transaksi (pemilik, jawaban Q2): satu hari per halaman, terbaru dulu, cari nomor struk. */
export function SalesPage() {
  const search = useSearch({ from: "/owner/lainnya/transaksi" });
  const navigate = useNavigate({ from: "/owner/lainnya/transaksi" });
  const [text, setText] = useState(search.q ?? "");
  const q = useDeferredValue(text.trim());
  const now = Date.now();
  const today = jakartaIsoDate(now);
  const date = effectiveDate(search.tanggal, q, now);
  const query = useListOwnerSales({ date, ...(q ? { q } : {}) });
  const rows = query.data;

  // Hari ini = alamat polos; hari lain disimpan di URL agar tombol kembali menjaganya.
  const dayLink = (iso: string) => ({
    to: "/owner/lainnya/transaksi" as const,
    search: {
      ...(iso === today ? {} : { tanggal: iso }),
      ...(search.q ? { q: search.q } : {}),
    },
  });

  return (
    <div className="pb-24 lg:pb-8">
      <SubPageHeader
        title="Transaksi"
        eyebrow={saleDayLabel(date)}
        back={{ label: "Lainnya", fallback: "/owner/lainnya" }}
      />
      <div className="grid gap-4 lg:max-w-2xl">
        <section
          aria-label="Hari"
          className="flex items-center rounded-[14px] bg-surface"
        >
          <Link
            {...dayLink(addIsoDays(date, -1))}
            aria-label="Hari sebelumnya"
            className={stepClass}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
          <span className="min-w-0 flex-1 text-center font-semibold">
            {saleDayLabel(date)}
          </span>
          {date >= today ? (
            <button
              type="button"
              disabled
              aria-label="Hari berikutnya"
              className={`${stepClass} text-border`}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          ) : (
            <Link
              {...dayLink(addIsoDays(date, 1))}
              aria-label="Hari berikutnya"
              className={stepClass}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </Link>
          )}
        </section>

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            aria-label="Cari nomor struk"
            placeholder="Cari nomor struk"
            maxLength={20}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              void navigate({
                search: (prev) => {
                  const { q: _old, ...rest } = prev;
                  return e.target.value.trim()
                    ? { ...rest, q: e.target.value.trim() }
                    : rest;
                },
                replace: true,
              });
            }}
            className="h-11 w-full rounded-full bg-surface pr-4 pl-9 text-base shadow-sm outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {!rows ? (
          query.isError ? (
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
          )
        ) : rows.length === 0 ? (
          <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
            {q ? "Tidak ada transaksi yang cocok" : "Tidak ada transaksi"}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface">
            <RowList>
              {rows.map((s) => (
                <SaleRow key={s.id} sale={s} />
              ))}
            </RowList>
          </div>
        )}
      </div>
    </div>
  );
}
