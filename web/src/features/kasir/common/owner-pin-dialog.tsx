import { useId, useState } from "react";
import { useScanGuard } from "@/shared/hooks/use-scan-guard";
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
import { ScannedAlert } from "./scanned-alert";

const PIN_LENGTH = 6;

type Props = {
  open: boolean;
  title: string;
  requireReason: boolean;
  onSubmit: (pin: string, reason?: string) => void;
  onCancel: () => void;
  error?: string | undefined;
  pending?: boolean | undefined;
};

function PinForm({
  requireReason,
  onSubmit,
  onCancel,
  error,
  pending = false,
}: Omit<Props, "open" | "title">) {
  const pinId = useId();
  const reasonId = useId();
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const guard = useScanGuard(setPin);
  const ready =
    pin.length === PIN_LENGTH && (!requireReason || reason.trim() !== "");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || pending) return;
        if (requireReason) onSubmit(pin, reason.trim());
        else onSubmit(pin);
      }}
    >
      <label htmlFor={pinId} className="text-sm font-medium">
        PIN
      </label>
      <Input
        id={pinId}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={pin}
        onKeyDown={guard.onKeyDown}
        onChange={(e) =>
          setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
        }
        className="h-14 text-center text-2xl tracking-[0.5em] tabular-nums"
      />
      {requireReason && (
        <>
          <label htmlFor={reasonId} className="text-sm font-medium">
            Alasan
          </label>
          <textarea
            id={reasonId}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-border px-3 py-2 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
        </>
      )}
      <ScannedAlert show={guard.scanned} />
      {error && !guard.scanned && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Batal
        </Button>
        <Button type="submit" disabled={!ready || pending} aria-busy={pending}>
          Konfirmasi
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Minta PIN pemilik (6 digit), opsional dengan alasan. Dipakai kasbon di atas limit & batal penjualan. */
export function OwnerPinDialog({ open, title, ...form }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !form.pending) form.onCancel();
      }}
    >
      <DialogContent className="max-w-sm" showCloseButton={!form.pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Masukkan PIN pemilik untuk melanjutkan.
          </DialogDescription>
        </DialogHeader>
        {open && <PinForm {...form} />}
      </DialogContent>
    </Dialog>
  );
}
