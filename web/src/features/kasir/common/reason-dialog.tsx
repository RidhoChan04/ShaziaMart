import { type ReactNode, type RefObject, useId, useRef } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { OwnerPhoneLine } from "./owner-phone-line";
import { ScannedAlert } from "./scanned-alert";
import { useReasonField } from "./use-reason-field";

type Props = {
  open: boolean;
  title: string;
  /** Kalimat ringkas di bawah judul; kosong = tanpa deskripsi (tidak dibacakan kosong). */
  description: string;
  confirmLabel: string;
  pending: boolean;
  error?: string | undefined;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  /** (koreksi mockup M2) primary = hijau (kasbon lewat limit); danger = merah (batal). */
  confirmTone: "primary" | "danger";
  /** Isi tambahan di antara keterangan dan isian Alasan, mis. pilihan pengembalian QRIS. */
  children?: ReactNode;
  /** Fokus setelah dialog tertutup; bila tidak diisi Radix mengembalikannya ke pemicu semula. */
  onCloseAutoFocus?: (e: Event) => void;
  /** (R11) Nomor pemilik di bawah isian Alasan; null/kosong = tanpa baris. Tampilan saja, dialog tidak mengambil data. */
  ownerPhone?: string | null;
};

function ReasonForm({
  confirmLabel,
  confirmTone,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
  ownerPhone,
  inputRef,
}: Omit<Props, "open" | "title" | "description" | "onCloseAutoFocus"> & {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const field = useReasonField();
  const trimmed = field.trimmed;
  const ready = trimmed !== "" && !pending;

  return (
    <form
      className="grid gap-3"
      {...field.formProps}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(trimmed);
      }}
    >
      {children}
      <label htmlFor={id} className="text-sm font-medium">
        Alasan
      </label>
      <Input ref={inputRef} id={id} {...field.inputProps} />
      <ScannedAlert
        show={field.scanned}
        text="Itu hasil scan barcode, bukan alasan"
      />
      {error && !field.scanned && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <OwnerPhoneLine phone={ownerPhone ?? null} />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Kembali
        </Button>
        <Button
          type="submit"
          variant={confirmTone}
          disabled={!ready}
          aria-busy={pending}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Dialog alasan wajib (ruling R1/R5) menggantikan PIN pemilik: batal transaksi, batal pelunasan,
 * kasbon lewat limit. Fokus ke isian Alasan; Esc/Kembali menutup kecuali saat menyimpan.
 */
export function ReasonDialog({
  open,
  title,
  description,
  onCloseAutoFocus,
  ...form
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !form.pending) form.onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-[400px]"
        showCloseButton={!form.pending}
        {...(description === "" ? { "aria-describedby": undefined } : {})}
        onOpenAutoFocus={(e) => {
          // Isian Alasan, bukan pilihan pertama di `children`.
          e.preventDefault();
          inputRef.current?.focus();
        }}
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== "" && (
            <DialogDescription className="text-text tabular-nums">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {open && <ReasonForm {...form} inputRef={inputRef} />}
      </DialogContent>
    </Dialog>
  );
}
