import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useCheckOwnerProductImport,
  useCommitOwnerProductImport,
} from "@/shared/api/gen/owner/owner";
import type { ImportRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { buttonVariants } from "@/shared/ui/button";
import { SubPageHeader } from "../../common/sub-page-header";
import { ImportPreview, type LoadedFile } from "./import-preview";
import {
  buildPreview,
  MAX_FILE_BYTES,
  numberBarcodeProblems,
  toImportRows,
} from "./import-rows";

const SHEET = "Barang";
const ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const STEPS = ["Pilih file", "Periksa", "Impor"] as const;

function StepItem({
  step,
  label,
  current,
}: {
  step: number;
  label: string;
  current: number;
}) {
  const done = step < current;
  const reached = step <= current;
  const active = step === current;
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex items-center gap-2",
        reached ? "text-text" : "text-muted",
        active ? "font-bold" : "font-medium",
      )}
    >
      {step > 1 && (
        <span
          aria-hidden="true"
          className={cn(
            "mr-0.5 w-4 border-t-2 sm:mr-1 sm:w-12",
            reached ? "border-primary" : "border-border",
          )}
        />
      )}
      <span
        className={cn(
          "grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-[13px] font-bold",
          reached
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted/60",
          active && "ring-4 ring-primary/20",
        )}
      >
        {done ? (
          <Check aria-hidden="true" className="size-3.5 stroke-3" />
        ) : (
          step
        )}
      </span>
      {label}
    </li>
  );
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      aria-label="Langkah impor"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[15px] sm:gap-x-3"
    >
      {STEPS.map((label, i) => (
        <StepItem key={label} step={i + 1} label={label} current={current} />
      ))}
    </ol>
  );
}

type FileRows = {
  rows: ImportRow[];
  local: Map<number, string[]>;
};

/** Pembaca xlsx dimuat di sini saja (chunk terpisah); galat file → pesan untuk pemilik. */
async function readRows(file: File): Promise<FileRows | string> {
  const { readSheet, ImportFileError } = await import("./read-xlsx");
  let sheet: Awaited<ReturnType<typeof readSheet>>;
  try {
    sheet = await readSheet(await file.arrayBuffer(), SHEET);
  } catch (err) {
    if (err instanceof ImportFileError) return err.message;
    throw err;
  }
  const rows = toImportRows(sheet);
  if (rows.length === 0) return "Tidak ada baris barang di file ini";
  return { rows, local: numberBarcodeProblems(sheet) };
}

export function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const check = useCheckOwnerProductImport();
  const commit = useCommitOwnerProductImport();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function choose(picked: File) {
    setError(null);
    if (picked.size > MAX_FILE_BYTES) {
      setError("File terlalu besar (maks. 5 MB)");
      return;
    }
    setReading(true);
    try {
      const read = await readRows(picked);
      if (typeof read === "string") {
        setError(read);
        return;
      }
      const result = await check.mutateAsync({ data: { rows: read.rows } });
      setFile({
        name: picked.name,
        size: picked.size,
        preview: buildPreview(read.rows, result, read.local),
      });
    } catch (err) {
      setError(pesanError(err));
    } finally {
      setReading(false);
    }
  }

  function runImport(loaded: LoadedFile) {
    commit.mutate(
      { data: { rows: loaded.preview.importable } },
      {
        onSuccess: ({ created, updated }) => {
          toast.success(`${created} barang baru, ${updated} diperbarui`);
          // Impor menyentuh daftar, detail, kategori, dan ringkasan Beranda sekaligus.
          void queryClient.invalidateQueries();
          void navigate({ to: "/owner/barang" });
        },
      },
    );
  }

  const step = file === null ? 1 : commit.isPending ? 3 : 2;

  return (
    <>
      <SubPageHeader
        title="Impor dari Excel"
        back={{ label: "Barang", fallback: "/owner/barang" }}
      />
      <StepIndicator current={step} />
      {file === null ? (
        <section className="grid justify-items-center gap-4 rounded-lg bg-surface px-4 py-10 text-center">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-lg bg-primary text-primary-foreground"
          >
            <FileSpreadsheet className="size-7" />
          </span>
          <label
            className={cn(
              buttonVariants({ size: "lg" }),
              "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
              reading && "pointer-events-none opacity-50",
            )}
          >
            Pilih file
            <input
              type="file"
              accept={ACCEPT}
              disabled={reading}
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = "";
                if (picked) void choose(picked);
              }}
            />
          </label>
          {reading && (
            <p role="status" className="text-muted">
              Memuat…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <a
            href="/templates/data-barang.xlsx"
            download="data-barang.xlsx"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <Download aria-hidden="true" className="size-4" />
            Unduh template Excel
          </a>
        </section>
      ) : (
        <ImportPreview
          file={file}
          importing={commit.isPending}
          error={commit.isError ? pesanError(commit.error) : null}
          onReplace={() => {
            commit.reset();
            setFile(null);
          }}
          onImport={() => runImport(file)}
        />
      )}
    </>
  );
}
