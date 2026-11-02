import { Link } from "@tanstack/react-router";
import {
  Check,
  FileSpreadsheet,
  Info,
  type LucideIcon,
  RefreshCw,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { formatAngka } from "@/shared/lib/money";
import { Button, buttonVariants } from "@/shared/ui/button";
import type { Preview } from "./import-rows";
import { PreviewTable } from "./import-table";

export type LoadedFile = { name: string; size: number; preview: Preview };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

function SummaryTile({
  icon: Icon,
  tone,
  count,
  label,
  note,
}: {
  icon: LucideIcon;
  tone: string;
  count: number;
  label: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface px-4 py-3.5">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          tone,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          <b className="block text-[26px] leading-tight font-bold tracking-[-0.02em] tabular-nums">
            {count}
          </b>{" "}
          {label}
        </p>
        <p className="text-xs text-muted">{note}</p>
      </div>
    </div>
  );
}

function FilterButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-11 rounded-md px-4 text-sm",
        focusRing,
        pressed ? "bg-surface font-semibold shadow-sm" : "font-medium",
      )}
    >
      {children}
    </button>
  );
}

/** Langkah 2 (Periksa): kartu file, ringkasan, tabel pratinjau, dan bilah Impor. */
export function ImportPreview({
  file,
  importing,
  error,
  onReplace,
  onImport,
}: {
  file: LoadedFile;
  importing: boolean;
  error: string | null;
  onReplace: () => void;
  onImport: () => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const { rows, summary, importable } = file.preview;
  const visible = onlyProblems
    ? rows.filter((r) => r.result.status === "perbaiki")
    : rows;

  return (
    <>
      <section
        aria-label="Ringkasan"
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[1.9fr_1fr_1fr_1fr]"
      >
        <div className="flex items-center gap-3.5 rounded-lg bg-surface p-4 sm:col-span-3 lg:col-span-1">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
          >
            <FileSpreadsheet className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{file.name}</p>
            <p className="text-[13px] text-muted tabular-nums">
              {`${rows.length} baris · ${formatAngka(Math.ceil(file.size / 1024))} KB`}
            </p>
          </div>
          <button
            type="button"
            onClick={onReplace}
            disabled={importing}
            className={cn(
              "h-11 shrink-0 rounded-md bg-bg px-3.5 text-[15px] font-semibold text-primary disabled:opacity-50",
              focusRing,
            )}
          >
            Ganti file
          </button>
        </div>
        <SummaryTile
          icon={Check}
          tone="bg-primary-soft text-primary"
          count={summary.ready}
          label="baris siap"
          note="akan diimpor"
        />
        <SummaryTile
          icon={RefreshCw}
          tone="bg-warning-soft text-warning-ink"
          count={summary.update}
          label="akan diperbarui"
          note="akan diimpor"
        />
        <SummaryTile
          icon={X}
          tone="bg-danger-soft text-danger-ink"
          count={summary.invalid}
          label="perlu diperbaiki"
          note="dilewati"
        />
      </section>

      <section
        aria-label="Pratinjau baris"
        className="mt-3 overflow-hidden rounded-lg bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="inline-flex rounded-[10px] bg-border/70 p-0.5">
            <FilterButton
              pressed={!onlyProblems}
              onClick={() => setOnlyProblems(false)}
            >
              Semua{" "}
              <span className="text-muted tabular-nums">{rows.length}</span>
            </FilterButton>
            <FilterButton
              pressed={onlyProblems}
              onClick={() => setOnlyProblems(true)}
            >
              Perlu diperbaiki{" "}
              <span className="text-muted tabular-nums">{summary.invalid}</span>
            </FilterButton>
          </div>
          <p className="text-sm text-muted">Urut sesuai baris di Excel</p>
        </div>
        <PreviewTable rows={visible} />
      </section>

      <div className="glass sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 mt-4 flex flex-wrap items-center gap-3 rounded-lg py-3 pr-3 pl-4 shadow-lg lg:bottom-4">
        <p className="flex min-w-0 flex-1 basis-64 items-center gap-2.5 text-[15px]">
          <Info aria-hidden="true" className="size-5 shrink-0 text-muted" />
          Baris bermasalah dilewati — perbaiki di Excel lalu impor ulang
        </p>
        <div className="ml-auto flex gap-2">
          <Link
            to="/owner/barang"
            className={cn(buttonVariants({ variant: "ghost" }), "text-primary")}
          >
            Batal
          </Link>
          <Button
            disabled={importable.length === 0 || importing}
            onClick={onImport}
          >
            Impor {importable.length} barang
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="basis-full text-sm font-medium text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </>
  );
}
