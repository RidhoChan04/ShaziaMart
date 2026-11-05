import { Link, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, Clock, OctagonAlert, Truck } from "lucide-react";
import type { ReactNode } from "react";
import type { StaffExpiryLot } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  useGetStaffExpiry,
  useListStaffLowStock,
  useListStaffOpnameCategories,
} from "@/shared/api/gen/staff/staff";
import { formatIsoDayMonth } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import { formatQty } from "@/shared/lib/quantity";
import { expiryWhenText, scopeLabel } from "@/shared/lib/stock-rules";
import { useStaffSession } from "../auth/staff-session";
import { useStaffSync } from "../drafts/sync-context";
import { useDrafts } from "../drafts/use-drafts";
import { OpnameDraftRow } from "../opname/opname-draft-row";
import { useOpnameDrafts } from "../opname/use-opname-drafts";
import { DraftStorageBanner } from "../receipt/draft-banner";
import { Card, SectionHeading } from "../receipt/form-ui";
import { DraftRow } from "../receipt/receipt-row";
import { LowStockRow } from "./low-stock-page";

const TOP = 3;

const seeAll =
  "inline-flex min-h-11 items-center px-1 text-[13px] font-semibold tracking-normal text-primary normal-case focus-visible:outline-2 focus-visible:outline-primary";

/** Bagian ringkasan: judul dengan jumlah, tautan Lihat semua, lalu kartu. */
function Summary({
  title,
  to,
  children,
}: {
  title: string;
  to: "/staff/kedaluwarsa" | "/staff/menipis";
  children: ReactNode;
}) {
  return (
    <section>
      <SectionHeading
        aside={
          <Link to={to} className={seeAll}>
            Lihat semua
          </Link>
        }
      >
        {title}
      </SectionHeading>
      <Card>
        <ul className="divide-y divide-border">{children}</ul>
      </Card>
    </section>
  );
}

function ExpiryLine({ lot, today }: { lot: StaffExpiryLot; today: string }) {
  const bad = lot.stage === "lewat";
  const Icon = bad ? OctagonAlert : Clock;
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <div className="font-medium">{lot.productName}</div>
        <div className="text-[14px] text-muted tabular-nums">
          {`±${formatQty(lot.estimateQtyBase, lot.unitSize, lot.unitName)} · ED ${formatIsoDayMonth(lot.expiryDate)}`}
        </div>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold",
          bad
            ? "bg-danger-soft text-danger-ink"
            : "bg-warning-soft text-warning-ink",
        )}
      >
        <Icon aria-hidden="true" className="size-3" />
        {bad ? "Sudah lewat" : expiryWhenText(lot.expiryDate, today)}
      </span>
    </li>
  );
}

const taskCard =
  "flex min-h-28 flex-col justify-between gap-3 rounded-lg p-4 shadow-sm transition-transform duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Beranda orang toko: dua tugas, ringkasan segera kedaluwarsa dan stok menipis (tanpa angka sisa), lalu draf yang belum terkirim. */
export function StaffBerandaPage() {
  const userId = useStaffSession().data?.user.id ?? "";
  const navigate = useNavigate();
  const { drafts, storageError } = useDrafts(userId);
  const opname = useOpnameDrafts(userId);
  const sync = useStaffSync();
  const categories = useListStaffOpnameCategories();
  const expiry = useGetStaffExpiry();
  const low = useListStaffLowStock();
  const unsent = drafts.filter((d) => d.status !== "editing");
  const unsentOpname = opname.drafts.filter((d) => d.status !== "counting");
  const unsentCount = unsent.length + unsentOpname.length;
  const lots = expiry.data?.lots ?? [];
  const lowItems = low.data ?? [];
  // M1: hari ini menurut server, sama dengan dasar tahapnya (jam HP bisa melenceng).
  const today = expiry.data?.today ?? "";
  const suggested = categories.data?.suggested ?? null;
  return (
    <div className="max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/staff/masuk/baru"
          className={cn(
            taskCard,
            "bg-linear-155 from-primary to-primary-deep text-primary-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-md bg-primary-foreground/20"
          >
            <Truck className="size-5" />
          </span>
          <span>
            <span className="block text-[17px] font-bold tracking-[-0.015em]">
              Barang masuk
            </span>
            <span className="text-[13px]">Catat nota supplier</span>
          </span>
        </Link>
        <Link
          to="/staff/opname"
          className={cn(taskCard, "bg-surface text-text")}
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary"
          >
            <ClipboardCheck className="size-5" />
          </span>
          <span>
            <span className="block text-[17px] font-bold tracking-[-0.015em]">
              Stok opname
            </span>
            <span className="text-[13px] text-muted">
              {suggested
                ? `Disarankan: ${scopeLabel(suggested)}`
                : "Pilih kategori"}
            </span>
          </span>
        </Link>
      </div>
      {(storageError || opname.storageError || sync.storageError) && (
        <DraftStorageBanner />
      )}
      {lots.length > 0 && (
        <Summary
          title={`Segera kedaluwarsa (${lots.length})`}
          to="/staff/kedaluwarsa"
        >
          {lots.slice(0, TOP).map((l) => (
            <ExpiryLine
              key={`${l.receiptId}/${l.lineId}`}
              lot={l}
              today={today}
            />
          ))}
        </Summary>
      )}
      {lowItems.length > 0 && (
        <Summary
          title={`Stok menipis (${lowItems.length})`}
          to="/staff/menipis"
        >
          {lowItems.slice(0, TOP).map((i) => (
            <LowStockRow key={i.productId} item={i} />
          ))}
        </Summary>
      )}
      {unsentCount > 0 && (
        <section>
          <SectionHeading>{`Belum terkirim (${unsentCount})`}</SectionHeading>
          <Card>
            {unsent.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                onOpen={() =>
                  void navigate({
                    to: "/staff/masuk/baru",
                    search: { draf: d.id },
                  })
                }
              />
            ))}
            {unsentOpname.map((d) => (
              <OpnameDraftRow
                key={d.id}
                draft={d}
                onOpen={() =>
                  void navigate({
                    to: "/staff/opname/hitung",
                    search: { draf: d.id },
                  })
                }
              />
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
