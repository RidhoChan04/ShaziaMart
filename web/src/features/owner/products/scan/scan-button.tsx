import { ScanLine } from "lucide-react";
import { useState } from "react";
import { BarcodeScanner, type ScanPurpose } from "./barcode-scanner";
import { useBarcodeSupport } from "./use-barcode-support";

type Props = {
  purpose: ScanPurpose;
  onDetected: (code: string) => void;
  onManual: () => void;
};

/** Tombol kamera; tidak tampil bila browser tanpa BarcodeDetector (isian tetap bisa diketik). */
export function ScanButton({ purpose, onDetected, onManual }: Props) {
  const supported = useBarcodeSupport();
  const [open, setOpen] = useState(false);
  if (!supported) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Scan dengan kamera"
        onClick={() => setOpen(true)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ScanLine aria-hidden="true" className="size-5" />
      </button>
      <BarcodeScanner
        open={open}
        purpose={purpose}
        onDetected={onDetected}
        onManual={() => {
          setOpen(false);
          onManual();
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
