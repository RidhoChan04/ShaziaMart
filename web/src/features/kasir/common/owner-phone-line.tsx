import { Phone } from "lucide-react";

/**
 * Baris R11 di bawah isian Alasan pada dialog alasan kasir. Nomor kosong (belum diisi pemilik,
 * atau request tanpa sesi) → tidak ada baris.
 */
export function OwnerPhoneLine({ phone }: { phone: string | null }) {
  if (phone === null || phone.trim() === "") return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted tabular-nums">
      <Phone aria-hidden="true" className="size-3.5 shrink-0" />
      {`Ragu? Telepon pemilik: ${phone}`}
    </p>
  );
}
