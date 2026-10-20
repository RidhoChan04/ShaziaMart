import { useCallback, useState } from "react";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { resolveCode } from "../scan/resolve-code";
import { ScanBox, useScanFocus } from "../scan/scan-box";
import { useScanDetector } from "../scan/use-scan-detector";
import { CartTable } from "./cart-table";
import { QuickCurahStrip } from "./quick-curah-strip";
import { TotalPanel } from "./total-panel";

/** Layar kasir: kolom scan, tombol curah, keranjang, dan panel total. */
export function KasirScreen() {
  const focus = useScanFocus();
  const { refocus } = focus;
  // State jendela curah & bayar; pemicunya menandai aria-expanded.
  const [curah, setCurah] = useState<CatalogMatch | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const onScan = useCallback(
    (code: string) => {
      void resolveCode(code, setCurah).then(refocus);
    },
    [refocus],
  );
  useScanDetector(onScan);

  return (
    <main className="flex min-h-0 flex-1 gap-3 p-3">
      <h1 className="sr-only">Kasir</h1>
      <section
        aria-label="Keranjang"
        className="flex min-w-0 flex-1 flex-col gap-2"
      >
        <ScanBox focus={focus} onCurah={setCurah} />
        <QuickCurahStrip
          openProductId={curah?.product.id ?? null}
          onCurah={setCurah}
        />
        <CartTable onAction={refocus} />
      </section>
      <TotalPanel
        payOpen={payOpen}
        onPay={() => setPayOpen(true)}
        onAction={refocus}
      />
    </main>
  );
}
