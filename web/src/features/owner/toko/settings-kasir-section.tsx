import { useId, useState } from "react";
import { useListOwnerProducts } from "@/shared/api/gen/owner/owner";
import {
  numberOf,
  SectionForm,
  type SectionProps,
  SwitchField,
  TextField,
  useSaveSection,
} from "./settings-fields";

const FRACTIONS_ERROR = "Isi pecahan dengan angka saja, dipisah koma";

/** Kasir: cetak otomatis, stok minus, pecahan curah, dan barang curah cepat (satu PATCH `kasir`). */
export function KasirSection({ settings, onSaved }: SectionProps) {
  const { kasir } = settings;
  const [autoPrint, setAutoPrint] = useState(kasir.autoPrint);
  const [negative, setNegative] = useState(kasir.allowNegativeStock);
  const [fractions, setFractions] = useState(kasir.curahFractions.join(", "));
  const [quickIds, setQuickIds] = useState(kasir.quickCurahProductIds);
  const [localError, setLocalError] = useState<string | null>(null);
  const products = useListOwnerProducts();
  const { save, pending, serverError, reset } = useSaveSection(onSaved);
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
      onEdit={() => {
        reset();
        setLocalError(null);
      }}
      onSubmit={() => {
        const parts = fractions
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p !== "");
        const parsed = parts.map((part) => numberOf("plain", part));
        if (parts.length === 0 || parsed.some((n) => n === null)) {
          setLocalError(FRACTIONS_ERROR);
          return;
        }
        setLocalError(null);
        save({
          kasir: {
            autoPrint,
            allowNegativeStock: negative,
            curahFractions: parsed as number[],
            quickCurahProductIds: quickIds,
          },
        });
      }}
    >
      <SwitchField
        label="Cetak struk otomatis"
        checked={autoPrint}
        onChange={(next) => {
          reset();
          setAutoPrint(next);
        }}
      />
      <SwitchField
        label="Izinkan stok minus"
        hint="Kasir tetap bisa menjual walau stok di aplikasi habis."
        checked={negative}
        onChange={(next) => {
          reset();
          setNegative(next);
        }}
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
