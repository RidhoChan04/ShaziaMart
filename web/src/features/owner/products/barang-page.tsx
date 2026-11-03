import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Download,
  Ellipsis,
  FileSpreadsheet,
  Plus,
  Search,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useListOwnerProducts } from "@/shared/api/gen/owner/owner";
import { ScanButton } from "@/shared/components/scan/scan-button";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { categoryChips, filterProducts } from "./product-model";
import { ProductRow, priceColumnWidth } from "./product-row";

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

const sheetItem =
  "flex min-h-12 w-full items-center justify-between gap-6 rounded-lg bg-bg px-4 text-[17px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

/** Action sheet ala iOS dari bawah; memakai Sheet yang sudah ada di bundel (tanpa popper/menu Radix). */
function MoreMenu() {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="Menu lainnya"
        className={cn(iconButton, "bg-surface text-text shadow-sm")}
      >
        <Ellipsis aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-sm"
      >
        <SheetTitle className="sr-only">Menu lainnya</SheetTitle>
        <SheetDescription className="sr-only">
          Impor atau unduh template Excel
        </SheetDescription>
        <div className="grid gap-2">
          <SheetClose asChild>
            <Link to="/owner/barang/impor" className={sheetItem}>
              Impor dari Excel
              <FileSpreadsheet aria-hidden="true" className="size-5" />
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <a
              href="/templates/data-barang.xlsx"
              download="data-barang.xlsx"
              className={sheetItem}
            >
              Unduh template Excel
              <Download aria-hidden="true" className="size-5" />
            </a>
          </SheetClose>
        </div>
        <SheetClose asChild>
          <Button variant="outline" className="mt-3 h-12 w-full text-[17px]">
            Batal
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        active ? "bg-primary text-primary-foreground" : "bg-surface text-text",
      )}
    >
      {children}
    </button>
  );
}

/** Lebar elemen daftar, diamati satu kali (bukan satu observer per baris). */
function useElementWidth() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(Math.floor(el.clientWidth));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry?.contentRect.width ?? 0)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export function BarangPage() {
  const { q = "", kategori, nonaktif } = useSearch({ from: "/owner/barang" });
  const navigate = useNavigate({ from: "/owner/barang" });
  // Kolom cari memegang teksnya sendiri; URL hanya cermin (replace) agar kursor tidak melompat.
  const [text, setText] = useState(q);
  // Sinkron dari URL (tombol kembali/maju, tautan) tanpa menimpa ketikan yang sudah tercermin.
  const pushed = useRef<string[]>([]);
  useEffect(() => {
    const own = pushed.current.indexOf(q);
    if (own >= 0) pushed.current.splice(0, own + 1);
    else {
      pushed.current = [];
      setText(q);
    }
  }, [q]);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredText = useDeferredValue(text);
  const [listRef, listWidth] = useElementWidth();
  const products = useListOwnerProducts();
  const rows = products.data;

  const isNonaktif = nonaktif === true;
  const visible = useMemo(
    () =>
      rows
        ? filterProducts(rows, {
            q: deferredText,
            kategori: kategori ?? null,
            nonaktif: isNonaktif,
          })
        : [],
    [rows, deferredText, kategori, isNonaktif],
  );
  const chips = useMemo(() => (rows ? categoryChips(rows) : []), [rows]);
  const activeCount = chips.reduce((sum, c) => sum + c.count, 0);
  const inactiveCount = rows
    ? rows.filter((r) => r.status === "nonaktif").length
    : 0;

  const setSearch = (next: {
    q: string;
    kategori?: string | undefined;
    nonaktif?: true | undefined;
  }) =>
    void navigate({
      search: {
        ...(next.q ? { q: next.q } : {}),
        ...(next.kategori ? { kategori: next.kategori } : {}),
        ...(next.nonaktif ? { nonaktif: true as const } : {}),
      },
      replace: true,
    });

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            aria-label="Cari nama atau barcode"
            placeholder="Cari nama atau barcode"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              pushed.current.push(e.target.value);
              setSearch({ q: e.target.value, kategori, nonaktif });
            }}
            ref={searchRef}
            className="h-11 w-full rounded-full bg-surface pr-12 pl-9 text-base shadow-sm outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="absolute top-0 right-0">
            <ScanButton
              label="Scan dengan kamera"
              purpose="cari"
              onDetected={(code) => {
                setText(code);
                pushed.current.push(code);
                setSearch({ q: code, kategori, nonaktif });
              }}
              onManual={() => setTimeout(() => searchRef.current?.focus(), 0)}
            />
          </div>
        </div>
        <MoreMenu />
        <Link
          to="/owner/barang/baru"
          aria-label="Tambah barang"
          className={cn(iconButton, "bg-primary text-primary-foreground")}
        >
          <Plus aria-hidden="true" className="size-5" />
        </Link>
      </div>

      {rows && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <Chip
            active={!kategori && !nonaktif}
            onClick={() => setSearch({ q: text })}
          >{`Semua ${activeCount}`}</Chip>
          {chips.map((c) => (
            <Chip
              key={c.key}
              active={kategori === c.key && !nonaktif}
              onClick={() => setSearch({ q: text, kategori: c.key })}
            >{`${c.label} ${c.count}`}</Chip>
          ))}
          {(inactiveCount > 0 || isNonaktif) && (
            <Chip
              active={nonaktif === true}
              onClick={() => setSearch({ q: text, nonaktif: true })}
            >{`Nonaktif ${inactiveCount}`}</Chip>
          )}
        </div>
      )}

      {products.isError && !rows ? (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-sm font-medium text-danger">
            {pesanError(products.error)}
          </p>
          <Button variant="outline" onClick={() => void products.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : !rows ? (
        <p role="status" className="text-muted">
          Memuat…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-8 text-center text-muted">
          Tidak ada barang yang cocok
        </p>
      ) : (
        <ul
          ref={listRef}
          // biome-ignore lint/a11y/noRedundantRoles: Safari/VoiceOver membuang semantik daftar bila list-style none
          role="list"
          className="overflow-hidden rounded-lg bg-surface"
        >
          {visible.map((row) => (
            <ProductRow
              key={row.id}
              row={row}
              priceWidth={priceColumnWidth(listWidth)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
