import {
  CircleCheck,
  CircleX,
  Copy,
  type LucideIcon,
  RefreshCw,
} from "lucide-react";
import type {
  ImportRow,
  ImportRowStatus,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cn } from "@/shared/lib/cn";
import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import type { PreviewRow } from "./import-rows";

const STATUS: Record<
  ImportRowStatus,
  { label: string; icon: LucideIcon; ink: string; row?: string }
> = {
  baru: { label: "Siap", icon: CircleCheck, ink: "text-primary" },
  diperbarui: {
    label: "Akan diperbarui",
    icon: RefreshCw,
    ink: "text-warning-ink",
    row: "bg-warning-soft/40",
  },
  tidak_berubah: {
    label: "Sudah ada, tidak berubah",
    icon: Copy,
    ink: "text-muted",
  },
  perbaiki: {
    label: "Perbaiki",
    icon: CircleX,
    ink: "text-danger-ink",
    row: "bg-danger-soft/40",
  },
};

/** Sel uang apa adanya bila bukan angka rupiah (server yang menandai masalahnya). */
const moneyText = (cell: string) => {
  const n = parseRupiah(cell);
  return n === null ? cell : formatRupiah(n);
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `{Besar} isi {n} · {Rp}`; tanpa satuan besar `—`. */
function bigUnitText(r: ImportRow): string {
  if (r.bigName === null && r.bigSize === null && r.bigPrice === null) {
    return "—";
  }
  const head = [
    r.bigName && capitalize(r.bigName),
    r.bigSize && `isi ${r.bigSize}`,
  ]
    .filter(Boolean)
    .join(" ");
  return [head, r.bigPrice && moneyText(r.bigPrice)]
    .filter(Boolean)
    .join(" · ");
}

function ProblemCell({ result }: { result: PreviewRow["result"] }) {
  if (result.problems.length > 0) {
    return (
      <p className="text-sm leading-snug font-medium text-danger-ink">
        {result.problems.join(" · ")}
      </p>
    );
  }
  const info = [...result.changes, ...result.notes];
  if (info.length > 0) {
    return (
      <p className="text-sm leading-snug text-muted">{info.join(" · ")}</p>
    );
  }
  return <span className="text-muted">—</span>;
}

function PreviewTableRow({ source, result }: PreviewRow) {
  const status = STATUS[result.status];
  const Icon = status.icon;
  const cell = "px-3 py-2.5 align-middle";
  return (
    <tr className={cn("border-b border-border last:border-b-0", status.row)}>
      <th
        scope="row"
        className={cn(
          cell,
          "pl-4 text-left font-normal text-muted tabular-nums",
        )}
      >
        {source.row}
      </th>
      <td className={cell}>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold",
            status.ink,
          )}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {status.label}
        </span>
      </td>
      <td className={cn(cell, "break-words")}>{source.name ?? "—"}</td>
      <td className={cn(cell, "break-words")}>{source.sellUnit ?? "—"}</td>
      <td className={cn(cell, "text-right tabular-nums")}>
        {source.price === null ? "—" : moneyText(source.price)}
      </td>
      <td className={cn(cell, "tabular-nums")}>{bigUnitText(source)}</td>
      <td className={cell}>
        <ProblemCell result={result} />
      </td>
    </tr>
  );
}

const HEADERS = [
  ["Baris", "w-16 pl-4"],
  ["Status", "w-36"],
  ["Nama", ""],
  ["Dijual per", "w-24"],
  ["Harga jual", "w-28 text-right"],
  ["Satuan besar", "w-48"],
  ["Masalah", ""],
] as const;

/** Tabel pratinjau; < 1024px bergulir di wadahnya sendiri sehingga halaman tidak bergulir ke samping. */
export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <section
      aria-label="Pratinjau impor"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: wilayah gulir harus bisa difokus keyboard
      tabIndex={0}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <table className="w-full min-w-[860px] table-fixed border-collapse text-[15px] lg:min-w-0">
        <thead>
          <tr className="border-y border-border bg-bg/60">
            {HEADERS.map(([label, width]) => (
              <th
                key={label}
                scope="col"
                className={cn(
                  "px-3 py-2 text-left text-[13px] font-semibold text-muted",
                  width,
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <PreviewTableRow key={r.source.row} {...r} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
