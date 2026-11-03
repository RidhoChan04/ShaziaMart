import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useSearchStaffProducts } from "@/shared/api/gen/staff/staff";
import { ScanButton } from "@/shared/components/scan/scan-button";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

type Props = {
  inputId: string;
  error?: string | undefined;
  onPick: (product: StaffProduct) => void;
  onNew: (name: string) => void;
};

/** Cari barang terdaftar (nama atau barcode, jeda 250 ms) atau scan kamera; satu hasil dari scan langsung terpilih. */
export function ProductPicker({ inputId, error, onPick, onNew }: Props) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [scanned, setScanned] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = text.trim();

  useEffect(() => {
    if (typed === q) return;
    const timer = setTimeout(() => setQ(typed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, q]);

  const enabled = q.length >= MIN_CHARS;
  const search = useSearchStaffProducts({ q }, { query: { enabled } });
  const results = enabled && typed === q ? search.data : undefined;

  const only = results?.length === 1 ? results[0] : undefined;
  const autoPicking = scanned !== null && scanned === q && only !== undefined;
  useEffect(() => {
    if (scanned !== null && scanned === q && only) onPick(only);
  }, [scanned, q, only, onPick]);

  const errorId = `${inputId}-error`;
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            aria-label="Cari nama atau barcode"
            placeholder="Cari nama atau barcode"
            autoComplete="off"
            value={text}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setScanned(null);
            }}
            className="h-11 w-full min-w-0 rounded-md border border-border bg-surface pr-3 pl-9 text-[17px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-danger"
          />
        </div>
        <ScanButton
          label="Scan barcode dengan kamera"
          purpose="cari"
          onDetected={(code) => {
            setText(code);
            setQ(code);
            setScanned(code);
          }}
          onManual={() => setTimeout(() => inputRef.current?.focus(), 0)}
        />
      </div>
      {error && (
        <p id={errorId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      {results && results.length > 0 && !autoPicking && (
        <ul className="grid gap-1">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-12 w-full min-w-0 flex-col items-start justify-center rounded-lg bg-bg px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="w-full truncate text-[17px] font-medium">
                  {p.name}
                </span>
                {p.category && (
                  <span className="text-[13px] text-muted">{p.category}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {results?.length === 0 && (
        <div className="grid gap-2 rounded-lg bg-bg p-3">
          <p role="status" className="text-[15px] text-muted">
            Tidak ada barang yang cocok
          </p>
          <button
            type="button"
            onClick={() => onNew(q)}
            className="min-h-11 rounded-md border border-primary px-3 text-left text-[15px] font-semibold break-words text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Barang baru: {q}
          </button>
        </div>
      )}
    </div>
  );
}
