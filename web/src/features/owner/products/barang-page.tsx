import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Download,
  Ellipsis,
  FileSpreadsheet,
  Plus,
  Search,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useMemo, useState } from "react";
import { useListOwnerProducts } from "@/shared/api/gen/owner/owner";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { categoryChips, filterProducts } from "./product-model";
import { ProductRow } from "./product-row";

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

const menuItem =
  "flex min-h-11 cursor-pointer items-center justify-between gap-6 px-4 text-[15px] outline-none data-[highlighted]:bg-primary-soft";

function MoreMenu() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Menu lainnya"
        className={cn(iconButton, "bg-surface text-text shadow-sm")}
      >
        <Ellipsis aria-hidden="true" className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-40 min-w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <DropdownMenu.Item asChild>
            <Link to="/owner/barang/impor" className={menuItem}>
              Impor dari Excel
              <FileSpreadsheet aria-hidden="true" className="size-4" />
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <a
              href="/templates/data-barang.xlsx"
              download="data-barang.xlsx"
              className={menuItem}
            >
              Unduh template Excel
              <Download aria-hidden="true" className="size-4" />
            </a>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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

export function BarangPage() {
  const { q = "", kategori, nonaktif } = useSearch({ from: "/owner/barang" });
  const navigate = useNavigate({ from: "/owner/barang" });
  // Kolom cari memegang teksnya sendiri; URL hanya cermin (replace) agar kursor tidak melompat.
  const [text, setText] = useState(q);
  const products = useListOwnerProducts();
  const rows = products.data;

  const isNonaktif = nonaktif === true;
  const visible = useMemo(
    () =>
      rows
        ? filterProducts(rows, {
            q: text,
            kategori: kategori ?? null,
            nonaktif: isNonaktif,
          })
        : [],
    [rows, text, kategori, isNonaktif],
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
              setSearch({ q: e.target.value, kategori, nonaktif });
            }}
            className="h-11 w-full rounded-full bg-surface pr-4 pl-9 text-base shadow-sm outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-primary"
          />
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
              key={c.label}
              active={kategori === c.label && !nonaktif}
              onClick={() => setSearch({ q: text, kategori: c.label })}
            >{`${c.label} ${c.count}`}</Chip>
          ))}
          {inactiveCount > 0 && (
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
        <ul className="overflow-hidden rounded-lg bg-surface">
          {visible.map((row) => (
            <ProductRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
