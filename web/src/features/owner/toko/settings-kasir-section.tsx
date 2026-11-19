import { useId, useState } from "react";
import { useListOwnerProducts } from "@/shared/api/gen/owner/owner";
import type { OwnerSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatAngka } from "@/shared/lib/money";
import {
  SectionForm,
  SwitchField,
  TextField,
  toInts,
  useSaveSection,
} from "./settings-fields";

const FRACTIONS_ERROR = "Isi pecahan dengan bilangan bulat, dipisah koma";

/** Kasir: cetak otomatis, stok minus, pecahan curah, dan barang curah cepat (satu PATCH `kasir`). */
export function KasirSection({ settings }: { settings: OwnerSettings }) {
  const { kasir } = settings;
  const [autoPrint, setAutoPrint] = useState(kasir.autoPrint);
  const [negative, setNegative] = useState(kasir.allowNegativeStock);
  const [fractions, setFractions] = useState(
    kasir.curahFractions.map(formatAngka).join(", "),
  );
  const [quickIds, setQuickIds] = useState(kasir.quickCurahProductIds);
  const [localError, setLocalError] = useState<string | null>(null);
  const products = useListOwnerProducts();
  const { save, pending, serverError } = useSaveSection();
  const errorId = useId();
  const error = localError ?? serverError;
  const curah = (products.data ?? []).filter(
    (p) => p.isCurah && p.status === "aktif",
  );

  return (
    <SectionForm
      pending={pending}
      error={error}
      errorId={errorId}
      onSubmit={() => {
        const parts = fractions
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p !== "");
        const parsed = toInts(parts);
        if (parsed === null) {
          setLocalError(FRACTIONS_ERROR);
          return;
        }
        setLocalError(null);
        save({
          kasir: {
            autoPrint,
            allowNegativeStock: negative,
            curahFractions: parsed,
            quickCurahProductIds: quickIds,
          },
        });
      }}
    >
      <SwitchField
        label="Cetak struk otomatis"
        checked={autoPrint}
        onChange={setAutoPrint}
      />
      <SwitchField
        label="Izinkan stok minus"
        hint="Kasir tetap bisa menjual walau stok di aplikasi habis."
        checked={negative}
        onChange={setNegative}
      />
      <TextField
        label="Pecahan curah"
        value={fractions}
        onChange={setFractions}
        invalid={error !== null}
        describedBy={error !== null ? errorId : undefined}
        hint="Dalam satuan dasar barang (mis. gram), dipisah koma, urut naik."
      />
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-[15px] font-semibold">Curah cepat</legend>
        {curah.length === 0 ? (
          <p className="text-[13px] text-muted">
            {products.isPending ? "Memuat…" : "Belum ada barang curah aktif."}
          </p>
        ) : (
          curah.map((p) => (
            <label
              key={p.id}
              className="flex min-h-11 items-center gap-3 text-[16px]"
            >
              <input
                type="checkbox"
                checked={quickIds.includes(p.id)}
                onChange={(e) =>
                  setQuickIds((ids) =>
                    e.target.checked
                      ? [...ids, p.id]
                      : ids.filter((id) => id !== p.id),
                  )
                }
                className="size-5 accent-primary"
              />
              {p.name}
            </label>
          ))
        )}
        <p className="text-[13px] text-muted">
          Paling banyak 12 barang tampil sebagai tombol cepat di kasir.
        </p>
      </fieldset>
    </SectionForm>
  );
}
