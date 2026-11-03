import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import type {
  ReceiptError,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getGetStaffReceiptQueryKey,
  getGetStaffReceiptQueryOptions,
  getListStaffReceiptsQueryKey,
  useGetStaffShift,
  useUpdateStaffReceipt,
} from "@/shared/api/gen/staff/staff";
import { readProblem, receiptProblemSchema } from "@/shared/api/problem";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { paymentSummary } from "@/shared/lib/payment-labels";
import {
  RECEIPT_PAYMENT_LOCKED,
  validateReceipt,
} from "@/shared/lib/receipt-rules";
import type { ReceiptForm } from "../drafts/draft-types";
import { toPayment } from "../drafts/receipt-input";
import { formFromReceipt, toReceiptEdit } from "./edit-model";
import { onNotaStep } from "./form-model";
import { LeaveButton } from "./leave-dialog";
import { toCheckLine } from "./line-model";
import { NotaStep } from "./nota-step";
import { PaymentStep } from "./payment-step";

const OFFLINE_NOTE = "Perlu tersambung ke toko untuk menyimpan perubahan";

/** Galat 422 per baris/field dipakai apa adanya; selain itu null (satu pesan umum). */
function serverErrors(error: unknown): ReceiptError[] | null {
  const problem = readProblem(error, receiptProblemSchema);
  return problem && problem.errors.length > 0 ? problem.errors : null;
}

const isCancelled = (error: unknown): boolean =>
  error instanceof ApiError && error.code === "RECEIPT_CANCELLED";

const isPaymentLocked = (e: ReceiptError): boolean =>
  e.lineId === null && e.message === RECEIPT_PAYMENT_LOCKED;

/** Form ubah nota milik sendiri: barang tetap, jumlah/harga/ED dan data nota bisa diubah; hanya online. */
export function EditForm({ receipt }: { receipt: StaffReceipt }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { online, checking } = useServerHealth();
  const shift = useGetStaffShift();
  const [form, setForm] = useState<ReceiptForm>(() =>
    formFromReceipt(receipt, null),
  );
  const [step, setStep] = useState<"nota" | "bayar">("nota");
  const [errors, setErrors] = useState<ReceiptError[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const update = useUpdateStaffReceipt();
  const today = jakartaIsoDate(Date.now());
  const offline = !online && !checking;
  const locked = !receipt.paymentEditable;
  // R6: nota yang sudah dibayar dari laci tetap bisa diubah walau shiftnya sudah tutup.
  const shiftOpen =
    locked || shift.isPending || shift.isError || shift.data.shift !== null;

  const problems = () =>
    validateReceipt(
      {
        supplierName: form.supplierName,
        notaDate: form.notaDate,
        lines: form.lines.map(toCheckLine),
        payment: toPayment(form.payment),
      },
      { today, shiftOpen },
    );
  const toList = () => void navigate({ to: "/staff/masuk" });
  const clearFor = (match: (e: ReceiptError) => boolean) =>
    setErrors((prev) => prev.filter((e) => !match(e)));
  const initial = useRef(
    JSON.stringify(toReceiptEdit(formFromReceipt(receipt, null))),
  );
  const dirty = JSON.stringify(toReceiptEdit(form)) !== initial.current;
  // Pembayaran terkunci tidak punya isian: galat pembayaran dari server tampil di bawah ringkasannya.
  const lockedErrors = locked
    ? errors
        .filter((e) => e.lineId === null && !onNotaStep(e))
        .map((e) => e.message)
    : [];

  const next = () => {
    const found = problems().filter(onNotaStep);
    setErrors(found);
    if (found.length === 0) setStep("bayar");
  };

  // Pemilik melunasi saat staf mengubah: muat ulang nota (pembayaran jadi ringkasan hanya-baca)
  // dan kembalikan isian pembayaran ke yang tersimpan; ubahan lain tetap.
  const relockPayment = async () => {
    const fresh = await client
      .fetchQuery({
        ...getGetStaffReceiptQueryOptions(receipt.id),
        staleTime: 0,
      })
      .catch(() => null);
    if (!fresh || fresh.paymentEditable) return;
    const payment = formFromReceipt(fresh, null).payment;
    setForm((f) => ({ ...f, payment }));
  };

  const failed = (error: unknown) => {
    const listed = serverErrors(error);
    if (listed) {
      setErrors(listed);
      if (listed.some(onNotaStep)) setStep("nota");
      if (listed.some(isPaymentLocked)) void relockPayment();
      return;
    }
    setFailure(pesanError(error));
    if (isCancelled(error)) {
      // Nota dibatalkan pemilik: simpan dikunci, pesan tetap tampil; daftar dimuat ulang.
      setCancelled(true);
      void client.invalidateQueries({
        queryKey: getListStaffReceiptsQueryKey(),
      });
    }
  };

  const save = async () => {
    const found = problems();
    setErrors(found);
    if (found.length > 0) {
      if (found.some(onNotaStep)) setStep("nota");
      return;
    }
    setFailure(null);
    try {
      await update.mutateAsync({
        receiptId: receipt.id,
        data: toReceiptEdit(form),
      });
    } catch (error) {
      failed(error);
      return;
    }
    void client.invalidateQueries({ queryKey: getListStaffReceiptsQueryKey() });
    void client.invalidateQueries({
      queryKey: getGetStaffReceiptQueryKey(receipt.id),
    });
    toast.success("Perubahan tersimpan");
    toList();
  };

  return (
    <div className="mx-auto max-w-xl pb-6">
      <header className="flex items-center gap-3 py-3">
        <LeaveButton dirty={dirty} onLeave={toList} />
        <h1 className="text-[20px] leading-tight font-bold">Barang masuk</h1>
      </header>
      {failure && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger-ink"
        >
          {failure}
        </p>
      )}
      {step === "bayar" ? (
        <PaymentStep
          form={form}
          errors={errors}
          shift={shift.data?.shift ?? null}
          shiftUnknown={shift.isPending || shift.isError}
          busy={update.isPending || cancelled}
          edit={{
            fixedPayment: locked ? paymentSummary(receipt.payment) : null,
            note: offline ? OFFLINE_NOTE : null,
            errors: lockedErrors,
            offline,
          }}
          onPayment={(change) => {
            clearFor((e) => e.lineId === null && !onNotaStep(e));
            setForm((f) => ({ ...f, payment: change(f.payment) }));
          }}
          onBack={() => setStep("nota")}
          onSave={() => void save()}
        />
      ) : (
        <NotaStep
          form={form}
          photo={null}
          errors={errors}
          today={today}
          locked
          onForm={(change) => {
            clearFor(onNotaStep);
            setForm(change);
          }}
          onPhoto={() => undefined}
          onNext={next}
        />
      )}
    </div>
  );
}
