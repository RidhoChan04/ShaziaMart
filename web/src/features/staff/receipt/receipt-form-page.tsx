import { useNavigate, useSearch } from "@tanstack/react-router";
import { CloudCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { ReceiptError } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useGetStaffShift } from "@/shared/api/gen/staff/staff";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { Button } from "@/shared/ui/button";
import { useStaffSession } from "../auth/staff-session";
import { formProblems } from "../drafts/to-input";
import { useDraftStore, useDraftSync } from "../drafts/use-drafts";
import { CancelDialog } from "./cancel-dialog";
import { onNotaStep } from "./form-model";
import { NotaStep } from "./nota-step";
import { PaymentStep } from "./payment-step";
import { isIdTaken, renewIds } from "./resend";
import { useFormDraft } from "./use-form-draft";

const STORAGE_BANNER =
  "Draf tidak bisa disimpan di HP. Selesaikan dan simpan nota sekarang, jangan tutup halaman ini.";
const SAVE_FAILED =
  "Gagal menyimpan draf di HP — coba lagi, atau catat nota di kertas dulu.";
const bannerClass =
  "mb-3 rounded-lg bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger-ink";

export function ReceiptFormPage() {
  const userId = useStaffSession().data?.user.id ?? "";
  const { draf, langkah } = useSearch({ from: "/staff/masuk/baru" });
  const navigate = useNavigate();
  const today = jakartaIsoDate(Date.now());
  const form = useFormDraft(userId, draf, today);
  const sync = useDraftSync(userId === "" ? null : userId);
  const store = useDraftStore();
  const shiftQuery = useGetStaffShift();
  const shift = shiftQuery.data?.shift ?? null;
  // Shift belum diketahui (memuat/offline): laci tetap bisa dipilih, server yang memutuskan.
  const shiftUnknown = shiftQuery.isPending || shiftQuery.isError;
  const [errors, setErrors] = useState<ReceiptError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const { draft } = form;

  if (!draft) return null;
  // Ditolak server: galat per baris/field tampil sampai pengguna menyimpan lagi.
  const shown = errors.length > 0 ? errors : draft.errors;
  const goTo = (step: "nota" | "bayar") =>
    navigate({
      to: "/staff/masuk/baru",
      search: {
        draf: draft.id,
        ...(step === "bayar" ? { langkah: "bayar" as const } : {}),
      },
    });
  const toList = () => navigate({ to: "/staff/masuk" });
  const check = () =>
    formProblems(draft, { today, shiftOpen: shift !== null || shiftUnknown });

  const next = () => {
    const problems = check().filter(onNotaStep);
    setErrors(problems);
    if (problems.length === 0) void goTo("bayar");
  };

  const finish = async () => {
    const report = await sync.syncNow();
    if (report.sent.includes(draft.id)) {
      toast.success("Barang masuk tersimpan");
      return toList();
    }
    const stored = await store.get(draft.id);
    if (report.rejected.includes(draft.id) && stored) {
      form.unfreeze();
      form.replace(stored);
      setErrors(stored.errors);
      toast.error("Perlu dibetulkan — lihat pesan di baris");
      if (stored.errors.some(onNotaStep)) void goTo("nota");
      return;
    }
    toast("Belum terkirim — dikirim otomatis saat tersambung");
    return toList();
  };

  const submit = async () => {
    if (submitting.current) return;
    const problems = check();
    setErrors(problems);
    if (problems.length > 0) {
      if (problems.some(onNotaStep)) void goTo("nota");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    let queued = false;
    try {
      form.freeze();
      await form.save({ ...draft, status: "queued", errors: [] });
      queued = true;
      await finish();
    } catch {
      if (queued) {
        // Sudah tersimpan antre di HP; hanya pengirimannya yang gagal.
        toast("Tersimpan di HP — dikirim saat tersambung");
        await toList();
      } else {
        form.unfreeze();
        setFailure(SAVE_FAILED);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const keep = async () => {
    try {
      await form.flush();
      await toList();
    } catch {
      setFailure(SAVE_FAILED);
    }
  };

  const discard = async () => {
    form.freeze();
    try {
      await store.remove(draft.id);
      await toList();
    } catch {
      form.unfreeze();
      setFailure(SAVE_FAILED);
    }
  };

  // R25: ID nota dipakai pengguna lain; kirim ulang dengan ID nota dan foto baru.
  const resend = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      form.freeze();
      await form.save(renewIds(draft));
      await store.remove(draft.id);
    } catch {
      form.unfreeze();
      setFailure(SAVE_FAILED);
      submitting.current = false;
      setBusy(false);
      return;
    }
    const report = await sync.syncNow().catch(() => null);
    toast(
      report && report.sent.length > 0
        ? "Barang masuk tersimpan"
        : "Belum terkirim — dikirim otomatis saat tersambung",
    );
    await toList();
  };

  const clearFor = (match: (e: ReceiptError) => boolean) =>
    setErrors(shown.filter((e) => !match(e)));

  return (
    <div className="mx-auto max-w-xl pb-6">
      <header className="flex items-center gap-3 py-3">
        <CancelDialog
          onDiscard={() => void discard()}
          onKeep={() => void keep()}
        />
        <div className="min-w-0">
          <h1 className="text-[20px] leading-tight font-bold">Barang masuk</h1>
          <p className="flex items-center gap-1 text-[13px] text-muted">
            <CloudCheck aria-hidden="true" className="size-3.5" />
            Draf tersimpan di HP
          </p>
        </div>
      </header>
      {(form.storageError || sync.storageError) && (
        <p role="alert" className={bannerClass}>
          {STORAGE_BANNER}
        </p>
      )}
      {isIdTaken(draft) && (
        <Button
          variant="outline"
          className="mb-3 w-full"
          disabled={busy}
          onClick={() => void resend()}
        >
          Kirim sebagai nota baru
        </Button>
      )}
      {failure && (
        <p role="alert" className={bannerClass}>
          {failure}
        </p>
      )}
      {langkah === "bayar" ? (
        <PaymentStep
          form={draft.form}
          errors={shown}
          shift={shift}
          shiftUnknown={shiftUnknown}
          busy={busy || sync.syncing}
          onPayment={(change) => {
            clearFor((e) => e.lineId === null && !onNotaStep(e));
            form.update((d) => ({
              ...d,
              form: { ...d.form, payment: change(d.form.payment) },
            }));
          }}
          onBack={() => void goTo("nota")}
          onSave={() => void submit()}
        />
      ) : (
        <NotaStep
          form={draft.form}
          photo={draft.photo}
          errors={shown}
          today={today}
          onForm={(change) => {
            clearFor(onNotaStep);
            form.update((d) => ({ ...d, form: change(d.form) }));
          }}
          onPhoto={(photo) => {
            clearFor((e) => e.field === "photoId");
            form.update((d) => ({ ...d, photo }));
          }}
          onNext={next}
        />
      )}
    </div>
  );
}
