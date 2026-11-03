import { Flashlight, FlashlightOff } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { isValidBarcode } from "@/shared/lib/product-rules";
import { SCAN_FORMATS } from "./use-barcode-support";

export type ScanPurpose = "eceran" | "besar" | "cari";

const PURPOSE_NOTE: Record<ScanPurpose, string> = {
  eceran: "Barcode eceran",
  besar: "Barcode satuan besar",
  cari: "Cari barang",
};
const DENIED = "Kamera tidak bisa dibuka — ketik barcode secara manual";
const INTERVAL_MS = 150;

type TorchTrack = Omit<MediaStreamTrack, "getCapabilities"> & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

type Props = {
  open: boolean;
  purpose: ScanPurpose;
  onDetected: (code: string) => void;
  onManual: () => void;
  onClose: () => void;
};

const pill =
  "inline-flex h-11 items-center rounded-full bg-white/15 px-5 text-[17px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-white";

/** Deteksi tiap 150 ms; hasil yang bukan barcode valid diabaikan, yang pertama valid dilaporkan sekali. */
function watchBarcodes(
  video: HTMLVideoElement | null,
  formats: readonly string[],
  onHit: (code: string) => void,
): () => void {
  const detector = new BarcodeDetector({ formats });
  let busy = false;
  let live = true;
  const timer = setInterval(() => {
    if (busy || !video) return;
    busy = true;
    detector
      .detect(video)
      .then((found) => {
        const hit = found.find((f) => isValidBarcode(f.rawValue));
        if (!hit || !live) return;
        live = false;
        clearInterval(timer);
        onHit(hit.rawValue);
      })
      .catch(() => {})
      .finally(() => {
        busy = false;
      });
  }, INTERVAL_MS);
  return () => {
    live = false;
    clearInterval(timer);
  };
}

async function openCamera(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
  } catch {
    return null;
  }
}

/** SCAN_FORMATS yang sanggup dibaca browser ini; format yang tak dikenal membuat konstruktor gagal. */
async function usableFormats(): Promise<string[]> {
  const supported = await BarcodeDetector.getSupportedFormats();
  return SCAN_FORMATS.filter((f) => supported.includes(f));
}

function showStream(video: HTMLVideoElement | null, stream: MediaStream) {
  if (!video) return;
  video.srcObject = stream;
  void Promise.resolve(video.play?.()).catch(() => {});
}

function stopTracks(stream: MediaStream | null) {
  for (const t of stream?.getTracks() ?? []) t.stop();
}

type Session = {
  onTrack: (track: TorchTrack | null) => void;
  onFail: () => void;
  onHit: (code: string) => void;
};

/**
 * Buka kamera belakang, tampilkan di video, lalu pantau barcode. Kamera ditolak, detector
 * gagal dibuat, atau track berakhir (dicabut/diambil aplikasi lain) → `onFail`. Kembalian
 * menghentikan semuanya; aman dipanggil lebih dari sekali.
 */
function startScanner(
  video: () => HTMLVideoElement | null,
  session: Session,
): () => void {
  let alive = true;
  let stream: MediaStream | null = null;
  let stopWatch: (() => void) | undefined;
  const stop = () => {
    alive = false;
    stopWatch?.();
    for (const t of stream?.getVideoTracks() ?? []) t.onended = null;
    stopTracks(stream);
    stream = null;
  };
  const fail = () => {
    if (!alive) return;
    stop();
    session.onFail();
  };
  const run = async () => {
    const opened = await openCamera();
    if (!alive) {
      stopTracks(opened);
      return;
    }
    if (!opened) return fail();
    stream = opened;
    const track = opened.getVideoTracks()[0] as TorchTrack | undefined;
    if (track) track.onended = fail;
    session.onTrack(track ?? null);
    showStream(video(), opened);
    const formats = await usableFormats();
    if (!alive) return;
    stopWatch = watchBarcodes(video(), formats, (code) => {
      stop();
      session.onHit(code);
    });
  };
  run().catch(fail);
  return stop;
}

export function BarcodeScanner({
  open,
  purpose,
  onDetected,
  onManual,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<TorchTrack | null>(null);
  const callbacks = useRef({ onDetected, onClose });
  callbacks.current = { onDetected, onClose };
  // Barcode terbaca atau Ketik manual: pemanggil yang memindahkan fokus; Batal/Esc kembali ke pemicu.
  const handledRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    if (!open) return;
    handledRef.current = false;
    setFailed(false);
    setHasTorch(false);
    setTorchOn(false);
    const stop = startScanner(() => videoRef.current, {
      onTrack: (track) => {
        trackRef.current = track;
        setHasTorch(track?.getCapabilities?.()?.torch === true);
      },
      onFail: () => {
        trackRef.current = null;
        setFailed(true);
      },
      onHit: (code) => {
        handledRef.current = true;
        navigator.vibrate?.(50);
        callbacks.current.onDetected(code);
        callbacks.current.onClose();
      },
    });
    return () => {
      stop();
      trackRef.current = null;
    };
  }, [open]);

  const toggleTorch = () => {
    const next = !torchOn;
    void trackRef.current
      ?.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      .then(() => setTorchOn(next))
      .catch(() => {});
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            // Tanpa Dialog.Trigger, Radix tidak tahu ke mana fokus kembali.
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (!handledRef.current) returnFocusRef.current?.focus();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-scan-bg text-white outline-none"
        >
          <div className="z-10 flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} className={pill}>
              Batal
            </button>
            <Dialog.Title className="text-center text-[17px] font-semibold">
              Scan barcode
              <small className="block text-[13px] font-normal text-white/70">
                {PURPOSE_NOTE[purpose]}
              </small>
            </Dialog.Title>
            <span className="w-[76px]" aria-hidden="true" />
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
            <div
              aria-hidden="true"
              className="relative h-40 w-[80%] max-w-sm rounded-2xl border-2 border-white/90"
            />
          </div>
          <div className="z-10 grid justify-items-center gap-4 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {failed ? (
              <p role="alert" className="text-center text-[15px]">
                {DENIED}
              </p>
            ) : (
              <p className="text-[15px] text-white/80">
                Arahkan kamera ke barcode
              </p>
            )}
            {hasTorch && !failed && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-pressed={torchOn}
                aria-label={torchOn ? "Matikan senter" : "Nyalakan senter"}
                className={`${pill} size-12 justify-center px-0`}
              >
                {torchOn ? (
                  <FlashlightOff aria-hidden="true" className="size-5" />
                ) : (
                  <Flashlight aria-hidden="true" className="size-5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                handledRef.current = true;
                onManual();
              }}
              className={pill}
            >
              Ketik manual
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
