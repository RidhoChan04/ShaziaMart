import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import { formatRupiah } from "@/shared/lib/money";

/** Gambar QRIS toko + nominal yang harus dibayar pelanggan. */
export function QrisPanel({ amount }: { amount: number }) {
  const settings = useGetKasirSettings({ query: { staleTime: 60_000 } }).data;
  return (
    <div className="grid justify-items-center gap-2 text-center">
      {settings && (
        <img
          src={settings.qrisImageUrl}
          alt="QRIS toko"
          width={180}
          height={180}
          className="size-[180px] rounded-md border border-border"
        />
      )}
      <p className="text-[22px] font-bold tabular-nums">
        {formatRupiah(amount)}
      </p>
      <p className="text-sm text-muted">
        Klik Sudah masuk setelah notifikasi pembayaran diterima.
      </p>
    </div>
  );
}
