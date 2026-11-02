import { Barcode } from "lucide-react";
import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatQty } from "@/shared/lib/quantity";
import { RowList, Section } from "./section";

const capitalize = (s: string): string =>
  s.charAt(0).toLocaleUpperCase("id") + s.slice(1);

/** Barcode tiap satuan aktif, dengan keterangan satuannya. */
export function BarcodeCard({ product }: { product: OwnerProduct }) {
  const eceran = product.units[0];
  if (!eceran) return null;
  const rows = product.units
    .filter((u) => u.active)
    .flatMap((u) =>
      u.barcodes.map((code) => ({
        key: `${u.id}:${code}`,
        code,
        caption:
          u.id === eceran.id
            ? `Eceran · ${u.name}`
            : `${capitalize(u.name)} · isi ${formatQty(u.unitSize, eceran.unitSize, eceran.name)}`,
      })),
    );
  return (
    <Section title="Barcode">
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[15px] text-muted">Belum ada barcode</p>
      ) : (
        <RowList>
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-3">
              <Barcode
                aria-hidden="true"
                className="size-6 shrink-0 text-muted"
              />
              <div className="min-w-0">
                <b className="block text-[17px] tabular-nums">{r.code}</b>
                <small className="text-[13px] text-muted">{r.caption}</small>
              </div>
            </li>
          ))}
        </RowList>
      )}
    </Section>
  );
}
