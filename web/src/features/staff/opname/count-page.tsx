import { useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { BarcodeScanner } from "@/shared/components/scan/barcode-scanner";
import { useBarcodeSupport } from "@/shared/components/scan/use-barcode-support";
import { scopeLabel } from "@/shared/lib/stock-rules";
import { useStaffSession } from "../auth/staff-session";
import { useStaffSync } from "../drafts/sync-context";
import { CountCard } from "./count-card";
import { CountList } from "./count-list";
import {
  autoOpenProduct,
  type Current,
  changeQty,
  findByBarcode,
  nextUncounted,
  openProduct,
  setCount,
  withTouched,
} from "./count-model";
import {
  BottomActions,
  type Confirm,
  ConfirmDialog,
  CountHeader,
  CountNotices,
  NotFound,
  QUEUED_NOTE,
  RejectedErrors,
  ScanRow,
} from "./count-parts";
import { CountSearchSheet } from "./count-search-sheet";
import { sendQueued } from "./count-send";
import type { OpnameDraft } from "./opname-draft-types";
import { useOpnameDrafts } from "./use-opname-drafts";

function CountScreen({ draftId }: { draftId: string }) {
  const userId = useStaffSession().data?.user.id ?? "";
  const navigate = useNavigate();
  const { drafts, save, remove, loaded, storageError } =
    useOpnameDrafts(userId);
  const sync = useStaffSync();
  const supported = useBarcodeSupport();
  // Perubahan lokal langsung tampil; bacaan ulang dari HP menyusul. Kosong = pakai yang tersimpan.
  const [edited, setEdited] = useState<OpnameDraft | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [finishing, setFinishing] = useState(false);
  const scanRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);

  const draft = edited ?? drafts.find((d) => d.id === draftId);
  const toTab = () => void navigate({ to: "/staff/opname" });
  // Fokus kembali ke tombol Scan barcode (atau Cari bila kamera tidak ada) setelah scanner/lembar/simpan.
  const focusScan = () =>
    setTimeout(() => (scanRef.current ?? searchRef.current)?.focus(), 0);

  if (!draft) {
    return loaded ? (
      <NotFound onBack={toTab} />
    ) : (
      <p className="px-4 pt-4 text-muted">Memuat…</p>
    );
  }

  const readOnly = draft.status === "queued";
  const label = scopeLabel(draft.scope);
  const total = draft.products.length;
  const countedNow = Object.keys(withTouched(draft, current, 0).counts).length;
  const currentProduct = current
    ? draft.products.find((p) => p.id === current.productId)
    : undefined;

  // Gagal menulis ke HP: peringatan penyimpanan tampil (storageError); pemanggil yang perlu kepastian membaca hasilnya.
  const persist = async (next: OpnameDraft): Promise<boolean> => {
    setEdited(next);
    try {
      await save(next);
      return true;
    } catch {
      return false;
    }
  };
  // Jumlah di kartu yang sudah diubah tidak hilang saat pindah barang, jeda, atau selesai.
  const flushed = (): OpnameDraft => {
    const next = withTouched(draft, current, Date.now());
    if (next !== draft) void persist(next);
    return next;
  };

  const openItem = (product: StaffProduct, source: Current["source"]) => {
    if (readOnly || finishing) return;
    setMessage(null);
    if (current?.productId === product.id) return;
    setCurrent(openProduct(flushed(), product, source, Date.now()));
  };

  const onScan = (code: string) => {
    const product = findByBarcode(draft.products, code);
    if (product) openItem(product, "scan");
    else setMessage(`Barang ini tidak ada di ${label}`);
    focusScan();
  };

  const saveCurrent = () => {
    if (!current) return;
    const next = setCount(draft, current, Date.now());
    void persist(next);
    const following = nextUncounted(next, current.productId);
    setCurrent(following ? autoOpenProduct(next, following) : null);
    focusScan();
  };

  const removeCount = (productId: string) => {
    const { [productId]: _gone, ...counts } = draft.counts;
    void persist({
      ...draft,
      updatedAt: Date.now(),
      counts,
      errors: draft.errors.filter((e) => e.productId !== productId),
    });
  };

  // Jeda/Kembali: pindah hanya bila hitungan benar-benar tersimpan di HP.
  const leave = async () => {
    const next = withTouched(draft, current, Date.now());
    if (!readOnly && (next !== draft || storageError)) {
      if (!(await persist(next))) return;
    }
    toTab();
  };

  const finish = async () => {
    setConfirm(null);
    setFinishing(true);
    const queued: OpnameDraft = {
      ...flushed(),
      status: "queued",
      errors: [],
      updatedAt: Date.now(),
    };
    setEdited(queued);
    setCurrent(null);
    const outcome = await sendQueued(queued, save, sync.syncNow);
    if (outcome === "sent") {
      toast.success("Hitungan terkirim");
      void navigate({
        to: "/staff/opname/$sessionId",
        params: { sessionId: draftId },
      });
    } else if (outcome === "queued") {
      toast(QUEUED_NOTE);
      toTab();
    } else {
      // Gagal disimpan, atau ditolak server (draf `rejected` + galat per barang dibaca ulang dari HP).
      setEdited(null);
      setFinishing(false);
    }
  };

  const discard = async () => {
    setConfirm(null);
    try {
      await remove(draft.id);
      toTab();
    } catch {
      // storageError menampilkan peringatan
    }
  };

  return (
    <div className="max-w-xl pb-8">
      <CountHeader
        label={label}
        counted={Object.keys(draft.counts).length}
        total={total}
        readOnly={readOnly}
        onLeave={() => void leave()}
      />
      <CountNotices
        storageError={storageError || sync.storageError}
        queued={readOnly}
      />
      {draft.status === "rejected" && (
        <RejectedErrors draft={draft} onRemove={removeCount} />
      )}
      {!readOnly && (
        <ScanRow
          supported={supported}
          scanRef={scanRef}
          searchRef={searchRef}
          onScan={() => setScanning(true)}
          onSearch={() => setSearching(true)}
        />
      )}
      {message && (
        <p role="alert" className="mt-3 text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      {current && currentProduct && !readOnly && (
        <div className="mt-4">
          <CountCard
            product={currentProduct}
            current={current}
            onChange={(qtyBase) =>
              setCurrent(changeQty(current, qtyBase, Date.now()))
            }
            onSave={saveCurrent}
          />
        </div>
      )}
      <CountList
        draft={draft}
        currentId={readOnly ? null : (current?.productId ?? null)}
        onOpen={readOnly ? null : (p) => openItem(p, "buka")}
      />
      <BottomActions
        readOnly={readOnly}
        busy={finishing}
        canFinish={countedNow > 0}
        onFinish={() =>
          total > countedNow ? setConfirm("selesai") : void finish()
        }
        onDiscard={() => setConfirm("buang")}
      />
      <BarcodeScanner
        open={scanning}
        purpose="cari"
        onDetected={onScan}
        onManual={() => {
          setScanning(false);
          setSearching(true);
        }}
        onClose={() => setScanning(false)}
      />
      <CountSearchSheet
        open={searching}
        products={draft.products}
        onPick={(p) => {
          setSearching(false);
          openItem(p, "buka");
          focusScan();
        }}
        onClose={() => {
          setSearching(false);
          focusScan();
        }}
      />
      <ConfirmDialog
        open={confirm === "selesai"}
        title="Selesai sekarang?"
        body={`${total - countedNow} barang belum dihitung dan tidak ikut dicatat.`}
        confirm="Selesai menghitung"
        onConfirm={() => void finish()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "buang"}
        title="Buang hitungan ini?"
        body={`Hitungan ${label} di HP ini akan dihapus.`}
        confirm="Buang hitungan"
        danger
        onConfirm={() => void discard()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

/** Layar menghitung buta (mockup 6): barang dibuka lewat scan, ketuk, atau cari; stok sistem tidak pernah diminta. */
export function CountPage() {
  const { draf } = useSearch({ from: "/staff/opname/hitung" });
  return <CountScreen key={draf} draftId={draf} />;
}
