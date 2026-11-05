import { useQueryClient } from "@tanstack/react-query";
import { Clock, OctagonAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type {
  ExpiryEvent,
  StaffExpiryLot,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetStaffExpiryQueryKey,
  useCreateStaffExpiryRemoval,
  useGetStaffExpiry,
  usePutStaffLineExpiry,
} from "@/shared/api/gen/staff/staff";
import { ExpiryActionSheet } from "@/shared/components/expiry/expiry-action-sheet";
import { ExpiryDateSheet } from "@/shared/components/expiry/expiry-date-sheet";
import { ExpiryLogRow } from "@/shared/components/expiry/expiry-log-row";
import { ExpiryRemovalSheet } from "@/shared/components/expiry/expiry-removal-sheet";
import { ExpiryRow } from "@/shared/components/expiry/expiry-row";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import {
  formatIsoDate,
  formatIsoDayMonth,
  jakartaIsoDate,
  relativeDayTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { newId } from "@/shared/lib/id";
import { formatQty } from "@/shared/lib/quantity";
import { expiryWhenText, removedText } from "@/shared/lib/stock-rules";
import { useStaffSession } from "../auth/staff-session";
import { Card } from "../receipt/form-ui";

type Mode = "menu" | "date" | "remove" | null;

const lotKey = (l: Pick<StaffExpiryLot, "receiptId" | "lineId">) =>
  `${l.receiptId}/${l.lineId}`;

const qtyText = (l: StaffExpiryLot) =>
  formatQty(l.estimateQtyBase, l.unitSize, l.unitName);

function GroupHeading({
  tone,
  count,
  children,
}: {
  tone: "bad" | "warn";
  count: number;
  children: string;
}) {
  const Icon = tone === "bad" ? OctagonAlert : Clock;
  return (
    <h2
      className={`mt-5 mb-1.5 flex items-center gap-1.5 px-1 text-[15px] font-bold ${
        tone === "bad" ? "text-danger-ink" : "text-warning-ink"
      }`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
      <em className="font-medium text-muted not-italic">{count}</em>
    </h2>
  );
}

function eventText(e: ExpiryEvent): { text: string; detail: string } {
  const now = Date.now();
  if (e.kind === "keluar" && e.qtyBase !== null) {
    const qty = removedText(e.qtyBase, e.unitSize, e.unitName, e.isCurah);
    return {
      text: `${e.actorName} mengeluarkan ${qty} ${e.productName}`,
      detail: `Kedaluwarsa · ${relativeDayTime(e.at, now)}`,
    };
  }
  const range =
    e.fromDate && e.toDate
      ? `${formatIsoDate(e.fromDate)} → ${formatIsoDate(e.toDate)}`
      : "";
  return {
    text: `${e.actorName} membetulkan ED ${e.productName}`,
    detail: `${range} · ${relativeDayTime(e.at, now)}`,
  };
}

/** Tab Kedaluwarsa: perkiraan barang lewat / segera kedaluwarsa, betulkan ED, keluarkan dari stok. */
export function ExpiryPage() {
  const client = useQueryClient();
  const actorName = useStaffSession().data?.user.name ?? "";
  const { online, checking } = useServerHealth();
  const offline = !online && !checking;
  const list = useGetStaffExpiry();

  const [lot, setLot] = useState<StaffExpiryLot | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  // Naik tiap lembar dibuka agar isiannya mulai dari awal; ID penghapusan dipakai ulang saat coba lagi.
  const [session, setSession] = useState(0);
  const removalId = useRef("");
  const opener = useRef<HTMLElement | null>(null);

  const refresh = () =>
    client.invalidateQueries({ queryKey: getGetStaffExpiryQueryKey() });
  const removal = useCreateStaffExpiryRemoval();
  const fixDate = usePutStaffLineExpiry();

  const open = (l: StaffExpiryLot, button: HTMLButtonElement) => {
    opener.current = button;
    removal.reset();
    fixDate.reset();
    setLot(l);
    setMode("menu");
  };
  const close = () => setMode(null);
  const step = (next: "date" | "remove") => {
    removal.reset();
    fixDate.reset();
    if (next === "remove") removalId.current = newId();
    setSession((n) => n + 1);
    setMode(next);
  };

  const data = list.data;
  const today = jakartaIsoDate(Date.now());
  const lots = data?.lots ?? [];
  const expired = lots.filter((l) => l.stage === "lewat");
  const soon = lots.filter((l) => l.stage === "segera");

  const rows = (items: StaffExpiryLot[], tone: "bad" | "warn") => (
    <Card>
      <ul className="divide-y divide-border">
        {items.map((l) => (
          <ExpiryRow
            key={lotKey(l)}
            name={l.productName}
            qtyText={qtyText(l)}
            expiryText={formatIsoDate(l.expiryDate)}
            whenText={expiryWhenText(l.expiryDate, today)}
            tone={tone}
            onMore={(button) => open(l, button)}
          />
        ))}
      </ul>
    </Card>
  );

  return (
    <div className="max-w-xl">
      <p className="text-[15px] text-muted">
        Jumlah adalah perkiraan: barang lama dianggap terjual lebih dulu.
      </p>
      {list.isError && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {pesanError(list.error)}
        </p>
      )}
      {expired.length > 0 && (
        <>
          <GroupHeading tone="bad" count={expired.length}>
            Sudah lewat
          </GroupHeading>
          {rows(expired, "bad")}
        </>
      )}
      {soon.length > 0 && (
        <>
          <GroupHeading tone="warn" count={soon.length}>
            {`≤ ${data?.soonDays ?? 30} hari`}
          </GroupHeading>
          {rows(soon, "warn")}
        </>
      )}
      {data && lots.length === 0 && (
        <p className="mt-6 text-muted">
          Tidak ada barang yang mendekati kedaluwarsa
        </p>
      )}
      {data && data.recent.length > 0 && (
        <>
          <h2 className="mt-5 mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
            Baru dikeluarkan
          </h2>
          <Card>
            <ul className="divide-y divide-border">
              {data.recent.map((e) => (
                <ExpiryLogRow key={e.id} kind={e.kind} {...eventText(e)} />
              ))}
            </ul>
          </Card>
        </>
      )}
      {lot && (
        <>
          <ExpiryActionSheet
            open={mode === "menu"}
            onClose={close}
            returnFocus={opener}
            name={lot.productName}
            summary={`±${qtyText(lot)} · ED ${formatIsoDate(lot.expiryDate)} · ${lot.supplierName}, ${formatIsoDayMonth(lot.notaDate)}`}
            actorName={actorName}
            offline={offline}
            onChangeDate={() => step("date")}
            onRemove={() => step("remove")}
          />
          <ExpiryDateSheet
            key={`d${session}`}
            open={mode === "date"}
            onClose={close}
            returnFocus={opener}
            name={lot.productName}
            currentDate={lot.expiryDate}
            offline={offline}
            pending={fixDate.isPending}
            error={fixDate.isError ? pesanError(fixDate.error) : null}
            onSave={(expiryDate) =>
              fixDate.mutate(
                {
                  receiptId: lot.receiptId,
                  lineId: lot.lineId,
                  data: { expiryDate },
                },
                {
                  onSuccess: () => {
                    toast.success("Tanggal ED diperbarui");
                    void refresh();
                    close();
                  },
                },
              )
            }
          />
          <ExpiryRemovalSheet
            key={`r${session}`}
            open={mode === "remove"}
            onClose={close}
            returnFocus={opener}
            name={lot.productName}
            estimateQtyBase={lot.estimateQtyBase}
            unitName={lot.unitName}
            unitSize={lot.unitSize}
            isCurah={lot.isCurah}
            actorName={actorName}
            offline={offline}
            pending={removal.isPending}
            error={removal.isError ? pesanError(removal.error) : null}
            onSubmit={(qtyBase) =>
              removal.mutate(
                {
                  data: {
                    id: removalId.current,
                    receiptId: lot.receiptId,
                    lineId: lot.lineId,
                    qtyBase,
                  },
                },
                {
                  onSuccess: () => {
                    toast.success(
                      `${removedText(qtyBase, lot.unitSize, lot.unitName, lot.isCurah)} ${lot.productName} dikeluarkan`,
                    );
                    void refresh();
                    close();
                  },
                },
              )
            }
          />
        </>
      )}
    </div>
  );
}
