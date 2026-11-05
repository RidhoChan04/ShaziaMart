import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type {
  OpnameScope,
  StaffOpnameCategory,
  StaffOpnameRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  useListStaffOpnameCategories,
  useListStaffOpnameSessions,
} from "@/shared/api/gen/staff/staff";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import {
  formatIsoDayMonth,
  isoDaysBetween,
  jakartaIsoDate,
  jakartaTime,
} from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { sameScope, scopeLabel } from "@/shared/lib/stock-rules";
import { useStaffSession } from "../auth/staff-session";
import { useStaffSync } from "../drafts/sync-context";
import { Card } from "../receipt/form-ui";
import { OpnameDraftRow, OpnameRow } from "./opname-draft-row";
import { countingDraftFor, startCount } from "./start-count";
import { useOpnameDrafts } from "./use-opname-drafts";

const OFFLINE_START = "Perlu tersambung ke toko untuk mulai menghitung";
const ALL: OpnameScope = { kind: "semua", category: null };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-5">
      <h2 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <Card>{children}</Card>
    </section>
  );
}

function lastCountedNote(lastCountedAt: number | null, now: number): string {
  if (lastCountedAt === null) return "belum pernah dihitung";
  const days = isoDaysBetween(
    jakartaIsoDate(lastCountedAt),
    jakartaIsoDate(now),
  );
  return days <= 0
    ? "terakhir dihitung hari ini"
    : `terakhir dihitung ${days} hari lalu`;
}

function sessionNote(row: StaffOpnameRow): string {
  return row.status === "menunggu_alasan"
    ? `${row.diffCount} selisih · dikirim ${jakartaTime(row.submittedAt)}`
    : `${formatIsoDayMonth(jakartaIsoDate(row.finishedAt ?? row.submittedAt))} · ${row.diffCount} selisih`;
}

/** Tab Opname (mockup 5): lanjutkan hitungan, beri alasan, pilih kategori, lalu riwayat. */
export function OpnamePage() {
  const userId = useStaffSession().data?.user.id ?? "";
  const navigate = useNavigate();
  const { online, checking } = useServerHealth();
  const { drafts, save } = useOpnameDrafts(userId);
  // Draf antre dikirim otomatis di sini juga (tab dibuka lagi setelah ditutup).
  useStaffSync();
  const categories = useListStaffOpnameCategories();
  const sessions = useListStaffOpnameSessions();
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const offline = !online && !checking;
  const now = Date.now();

  const openDraft = (id: string) =>
    navigate({ to: "/staff/opname/hitung", search: { draf: id } });

  const start = async (scope: OpnameScope) => {
    setNotice(null);
    // Lingkup yang sudah punya draf dibuka dari HP, tanpa server (boleh offline).
    if (!countingDraftFor(scope, userId, drafts) && offline) {
      setNotice(OFFLINE_START);
      return;
    }
    setStarting(true);
    try {
      await openDraft(
        await startCount(scope, userId, drafts, save, Date.now()),
      );
    } catch (error) {
      setNotice(pesanError(error));
    } finally {
      setStarting(false);
    }
  };

  const rows = sessions.data ?? [];
  const awaiting = rows.filter((r) => r.status === "menunggu_alasan");
  const history = rows.filter((r) => r.status === "selesai");
  const suggested = categories.data?.suggested ?? null;
  const categoryRow = (c: StaffOpnameCategory) => (
    <OpnameRow
      key={`${c.scope.kind}:${c.scope.category ?? ""}`}
      title={scopeLabel(c.scope)}
      aside={`${c.productCount} barang`}
      note={lastCountedNote(c.lastCountedAt, now)}
      mark={
        suggested && sameScope(suggested, c.scope) ? "disarankan" : undefined
      }
      markText="Disarankan"
      onOpen={() => void start(c.scope)}
    />
  );
  const sessionRow = (r: StaffOpnameRow) => (
    <OpnameRow
      key={r.id}
      title={scopeLabel(r.scope)}
      note={sessionNote(r)}
      mark={r.heldCount > 0 ? "menunggu" : undefined}
      markText={`${r.heldCount} menunggu persetujuan`}
      onOpen={() =>
        void navigate({
          to: "/staff/opname/$sessionId",
          params: { sessionId: r.id },
        })
      }
    />
  );

  return (
    <div className="max-w-xl">
      <p className="text-[15px] text-muted">
        Satu rak, 15–30 menit. Toko tetap buka.
      </p>
      {notice && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-warning-soft px-4 py-3 text-[14px] font-medium text-warning-ink"
        >
          {notice}
        </p>
      )}
      {drafts.length > 0 && (
        <Group title="Sedang dihitung">
          {drafts.map((d) => (
            <OpnameDraftRow
              key={d.id}
              draft={d}
              onOpen={() => void openDraft(d.id)}
            />
          ))}
        </Group>
      )}
      {awaiting.length > 0 && (
        <Group title="Perlu diberi alasan">{awaiting.map(sessionRow)}</Group>
      )}
      {categories.data && categories.data.categories.length > 0 && (
        <fieldset disabled={starting} className="contents">
          <Group title="Kategori · paling lama dihitung di atas">
            {categories.data.categories.map(categoryRow)}
          </Group>
        </fieldset>
      )}
      {categories.data && categories.data.allCount > 0 && (
        <fieldset disabled={starting} className="contents">
          <Group title="Hitung semua">
            <OpnameRow
              title="Semua barang (stok awal)"
              note={`${categories.data.allCount} barang · untuk hitungan pertama`}
              onOpen={() => void start(ALL)}
            />
          </Group>
        </fieldset>
      )}
      {history.length > 0 && (
        <Group title="Riwayat">{history.map(sessionRow)}</Group>
      )}
      {categories.isError && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {pesanError(categories.error)}
        </p>
      )}
    </div>
  );
}
