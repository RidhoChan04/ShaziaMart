import { formatRupiah } from "@/shared/lib/money";

/** Kerangka layar kasir; keranjang, cari barang, dan bayar dibangun di F2. */
export function KasirPage() {
  return (
    <main className="flex flex-1 gap-3 p-3">
      <h1 className="sr-only">Kasir</h1>
      <section
        aria-label="Keranjang"
        className="flex min-w-0 flex-1 items-center justify-center rounded-md border border-border bg-surface text-muted"
      >
        Belum ada barang di keranjang
      </section>
      <div className="flex w-[300px] flex-col gap-2">
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs text-muted">TOTAL</p>
          <p className="num text-3xl font-bold tracking-tight">
            {formatRupiah(0)}
          </p>
        </div>
      </div>
    </main>
  );
}
