import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSearchCatalog } from "@/shared/api/gen/catalog/catalog";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { Input } from "@/shared/ui/input";
import { useCart } from "../cart/cart-store";
import { acceptMatch, resolveCode, resolveName } from "./resolve-code";

const DEBOUNCE_MS = 150;

/** Ref untuk kolom scan + `refocus()` yang aman dipanggil setelah dialog tertutup. */
export function useScanFocus() {
  const ref = useRef<HTMLInputElement>(null);
  const refocus = useCallback(() => {
    requestAnimationFrame(() => ref.current?.focus());
  }, []);
  return { ref, refocus };
}

/** Fokus ke kolom scan dari luar layar kasir (mis. tombol header). */
export function focusScanBox() {
  requestAnimationFrame(() =>
    document.querySelector<HTMLInputElement>("[data-scan-box]")?.focus(),
  );
}

function unitOf(match: CatalogMatch) {
  return match.product.units.find((u) => u.id === match.unitId);
}

export function ScanBox({
  focus,
  onCurah,
}: {
  focus: ReturnType<typeof useScanFocus>;
  onCurah: (match: CatalogMatch) => void;
}) {
  const { ref, refocus } = focus;
  const listId = useId();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const search = useSearchCatalog(
    { q },
    {
      query: {
        enabled: q.length >= 2 && !/^\d+$/.test(q),
        staleTime: 30_000,
      },
    },
  );
  const results = search.data ?? [];
  const searchActive = q.length >= 2 && !/^\d+$/.test(q);
  const listOpen = open && searchActive && results.length > 0;
  const empty =
    open && searchActive && search.isSuccess && results.length === 0;

  function clear() {
    setText("");
    setQ("");
    setActive(-1);
    setOpen(true);
  }

  function accept(match: CatalogMatch) {
    acceptMatch(match, onCurah);
    clear();
    refocus();
  }

  // Kolom dikosongkan sebelum dicari agar scan berikutnya tidak menyambung ke teks ini.
  function resolveLater(find: () => Promise<void>) {
    clear();
    void find().then(refocus);
  }

  function onArrow(down: boolean) {
    if (listOpen) {
      const n = results.length;
      setActive((i) => (down ? (i + 1) % n : (i - 1 + n) % n));
      return;
    }
    const cart = useCart.getState();
    if (down) cart.selectNext();
    else cart.selectPrev();
  }

  function onEnter() {
    const value = text.trim();
    // Daftar di layar hanya berlaku bila teks sudah sampai ke pencarian (debounce) dan hasilnya ada.
    const current = value === q && !search.isPending;
    // Tanpa sorotan, Enter memilih hasil teratas.
    const picked =
      current && listOpen ? (results[active] ?? results[0]) : undefined;
    if (picked) accept(picked);
    else if (/^\d+$/.test(value))
      resolveLater(() => resolveCode(value, onCurah));
    else if (!current && value.length >= 2) {
      resolveLater(() => resolveName(value, onCurah));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      onArrow(e.key === "ArrowDown");
    } else if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    } else if (e.key === "Escape" && (listOpen || empty)) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    } else if (e.key === "Delete" && text === "") {
      const { selectedLineId, remove } = useCart.getState();
      if (selectedLineId) remove(selectedLineId);
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="relative">
      <Input
        ref={ref}
        autoFocus
        data-scan-box
        role="combobox"
        aria-label="Scan barcode / ketik nama atau kode"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listId : undefined}
        aria-activedescendant={
          listOpen && active >= 0 ? optionId(active) : undefined
        }
        autoComplete="off"
        placeholder="Scan barcode / ketik nama atau kode…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {listOpen && (
        <div
          id={listId}
          role="listbox"
          aria-label="Hasil pencarian"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-surface shadow-md"
        >
          {results.slice(0, 8).map((m, i) => (
            <div
              key={`${m.product.id}-${m.unitId}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(m)}
              onKeyDown={() => {}}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                i === active && "bg-primary/10",
              )}
            >
              <span>{m.product.name}</span>
              <span className="tabular-nums text-muted">
                {formatRupiah(unitOf(m)?.price ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
      {empty && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted shadow-md">
          Tidak ada hasil
        </div>
      )}
    </div>
  );
}
