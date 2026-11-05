import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Check, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type {
  OpnameReasonInput,
  StaffOpnameItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetStaffOpnameSessionQueryKey,
  getListStaffOpnameSessionsQueryKey,
  useFinishStaffOpnameSession,
  useGetStaffOpnameSession,
} from "@/shared/api/gen/staff/staff";
import { opnameProblemSchema, readProblem } from "@/shared/api/problem";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { jakartaTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { scopeLabel } from "@/shared/lib/stock-rules";
import { Button } from "@/shared/ui/button";
import { Card, SectionHeading } from "../receipt/form-ui";
import { StaffPageHeader } from "../staff-page-header";
import { DiffCard } from "./diff-card";
import type { ReasonChoice } from "./reason-picker";

const OFFLINE_NOTE = "Perlu tersambung ke toko untuk menyimpan";
/** Tidak ikut daftar selisih yang diberi alasan. */
const NOT_A_DIFF: readonly StaffOpnameItem["state"][] = ["cocok", "stok_awal"];

function InfoRow({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <Check aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-[13px] text-muted">{note}</p>
      </div>
    </div>
  );
}

/** Alasan sudah dipilih; `salah_input` juga butuh pilihan nota (atau Tidak tahu notanya). */
const isComplete = (c: ReasonChoice | undefined): c is ReasonChoice =>
  c !== undefined && (c.reason !== "salah_input" || c.receiptId !== undefined);

/** Alasan terpilih per barang; `receiptId` hanya dikirim untuk `salah_input`. */
function reasonInputs(
  awaiting: readonly StaffOpnameItem[],
  choices: Record<string, ReasonChoice>,
): OpnameReasonInput[] {
  return awaiting.flatMap((i) => {
    const c = choices[i.productId];
    if (!isComplete(c)) return [];
    const receiptId = c.reason === "salah_input" ? (c.receiptId ?? null) : null;
    return [{ productId: i.productId, reason: c.reason, receiptId }];
  });
}

/**
 * 422 opname: pesan untuk kartu yang tampil (`shown`) per barang; sisanya (barang tak tampil, atau
 * tingkat sesi) jadi satu pesan umum. `stale` = ada galat barang yang tak punya kartu.
 */
function failureOf(
  error: unknown,
  shown: ReadonlySet<string>,
): { perItem: Record<string, string>; general: string | null; stale: boolean } {
  const listed = readProblem(error, opnameProblemSchema)?.errors ?? [];
  const perItem: Record<string, string> = {};
  const rest: string[] = [];
  for (const e of listed) {
    if (e.productId !== null && shown.has(e.productId)) {
      perItem[e.productId] = e.message;
    } else rest.push(e.message);
  }
  const stale = listed.some(
    (e) => e.productId !== null && !shown.has(e.productId),
  );
  if (listed.length === 0) {
    return { perItem, general: pesanError(error), stale };
  }
  return {
    perItem,
    general: rest.length > 0 ? [...new Set(rest)].join(". ") : null,
    stale,
  };
}

function SaveBar({
  missing,
  offline,
  pending,
  onSave,
}: {
  missing: number;
  offline: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 grid gap-2">
      {missing > 0 && (
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-warning-ink">
          <TriangleAlert aria-hidden="true" className="size-4" />
          {missing} barang belum diberi alasan
        </p>
      )}
      {offline && <p className="text-[13px] text-muted">{OFFLINE_NOTE}</p>}
      <Button
        className="min-h-12 w-full"
        disabled={missing > 0 || offline || pending}
        onClick={onSave}
      >
        Simpan hasil opname
      </Button>
    </div>
  );
}

/** Hasil opname (7a/7b): hitungan yang cocok, selisih yang wajib diberi alasan, lalu tanda per barang. */
export function OpnameResultPage() {
  const { sessionId } = useParams({ from: "/staff/opname/$sessionId" });
  const navigate = useNavigate();
  const client = useQueryClient();
  const { online, checking } = useServerHealth();
  const query = useGetStaffOpnameSession(sessionId);
  const finish = useFinishStaffOpnameSession();
  const [choices, setChoices] = useState<Record<string, ReasonChoice>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const toList = () => void navigate({ to: "/staff/opname" });

  const session = query.data;
  if (query.isError) {
    return (
      <div className="grid max-w-xl gap-3 px-4 pt-4">
        <p role="alert" className="font-medium text-danger">
          {pesanError(query.error)}
        </p>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={toList}
        >
          Kembali
        </Button>
      </div>
    );
  }
  if (!session) return <p className="px-4 pt-4 text-muted">Memuat…</p>;

  const offline = !online && !checking;
  const matched = session.items.filter((i) => i.state === "cocok").length;
  const initial = session.items.filter((i) => i.state === "stok_awal").length;
  const diffs = session.items.filter(
    (i) => !NOT_A_DIFF.includes(i.state) && i.state !== "diganti",
  );
  const replaced = session.items.filter((i) => i.state === "diganti");
  const awaiting = diffs.filter((i) => i.state === "menunggu_alasan");
  const missing = awaiting.filter(
    (i) => !isComplete(choices[i.productId]),
  ).length;
  const done = session.status === "selesai";
  const eyebrow = done
    ? `${scopeLabel(session.scope)} · selesai ${jakartaTime(session.finishedAt ?? session.submittedAt)}`
    : `${scopeLabel(session.scope)} · dikirim ${jakartaTime(session.submittedAt)}`;

  const choose = (productId: string, next: ReasonChoice) => {
    setChoices((prev) => ({ ...prev, [productId]: next }));
    setErrors(({ [productId]: _gone, ...rest }) => rest);
  };

  const submit = async () => {
    setFailure(null);
    setErrors({});
    try {
      const saved = await finish.mutateAsync({
        sessionId,
        data: { reasons: reasonInputs(awaiting, choices) },
      });
      client.setQueryData(getGetStaffOpnameSessionQueryKey(sessionId), saved);
      void client.invalidateQueries({
        queryKey: getListStaffOpnameSessionsQueryKey(),
      });
      toast.success("Hasil opname tersimpan");
    } catch (error) {
      const found = failureOf(error, new Set(awaiting.map((i) => i.productId)));
      setErrors(found.perItem);
      setFailure(found.general);
      if (found.stale) {
        void client.invalidateQueries({
          queryKey: getGetStaffOpnameSessionQueryKey(sessionId),
        });
      }
    }
  };

  return (
    <div className="pb-8">
      <StaffPageHeader title="Hasil opname" eyebrow={eyebrow} />
      <div className="mx-auto max-w-xl px-4">
        {(matched > 0 || initial > 0) && (
          <Card>
            {matched > 0 && (
              <InfoRow
                title={`${matched} cocok`}
                note="Langsung beres, tanpa alasan"
              />
            )}
            {initial > 0 && (
              <InfoRow
                title={`${initial} stok awal`}
                note="Langsung jadi stok, tanpa alasan"
              />
            )}
          </Card>
        )}
        {diffs.length + replaced.length > 0 && (
          <>
            <SectionHeading>
              {done || awaiting.length === 0
                ? `${diffs.length} selisih`
                : `${awaiting.length} selisih · wajib beri alasan`}
            </SectionHeading>
            <Card>
              {[...diffs, ...replaced].map((item) => (
                <DiffCard
                  key={item.productId}
                  item={item}
                  choice={choices[item.productId]}
                  error={errors[item.productId]}
                  onChoice={(next) => choose(item.productId, next)}
                />
              ))}
            </Card>
            <p className="mt-3 px-1 text-[13px] text-muted">
              Selisih dihitung terhadap stok sistem pada jam barang itu
              dihitung, jadi penjualan di sela-sela tidak membuat selisih palsu.
              Nilai rupiahnya hanya dilihat pemilik.
            </p>
          </>
        )}
        {failure && (
          <p role="alert" className="mt-3 font-medium text-danger">
            {failure}
          </p>
        )}
        {!done && awaiting.length > 0 && (
          <SaveBar
            missing={missing}
            offline={offline}
            pending={finish.isPending}
            onSave={() => void submit()}
          />
        )}
        {done && (
          <Button variant="outline" className="mt-4 min-h-12" onClick={toList}>
            Kembali
          </Button>
        )}
      </div>
    </div>
  );
}
