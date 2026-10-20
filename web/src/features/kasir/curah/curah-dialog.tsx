import { useEffect, useRef, useState } from "react";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import type {
  CatalogMatch,
  ProductUnit,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useScanGuard } from "@/shared/hooks/use-scan-guard";
import { cn } from "@/shared/lib/cn";
import { formatAngka, formatRupiah, parseRupiah } from "@/shared/lib/money";
import { priceLine } from "@/shared/lib/pricing";
import { formatApproxKg, formatGram, parseKg } from "@/shared/lib/quantity";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useCart } from "../cart/cart-store";
import { ScannedAlert } from "../shared/scanned-alert";

type Mode = "berat" | "nominal";
type Unit = Pick<ProductUnit, "price" | "unitSize" | "wholesaleTiers">;

const FRACTION_LABELS: Record<number, string> = {
  250: "¼",
  500: "½",
  1000: "1",
  1500: "1½",
  2000: "2",
};

/** Angka desimal Indonesia tanpa satuan, mis. 1500 → "1,5". */
function kgText(qtyBase: number): string {
  return formatGram(qtyBase).replace(/ kg$/, "");
}

function fractionLabel(qtyBase: number): string {
  return FRACTION_LABELS[qtyBase] ?? kgText(qtyBase);
}

function compute(unit: Unit, mode: Mode, text: string) {
  try {
    if (mode === "berat") {
      const qtyBase = parseKg(text);
      return qtyBase === null ? null : priceLine(unit, { qtyBase });
    }
    const amount = parseRupiah(text);
    if (amount === null || amount <= 0) return null;
    const p = priceLine(unit, { amount });
    // Nominal terlalu kecil untuk 1 gram/ml tidak boleh jadi baris berjumlah 0.
    return p.qtyBase > 0 ? p : null;
  } catch {
    return null;
  }
}

function CurahForm({
  match,
  onClose,
}: {
  match: CatalogMatch;
  onClose: () => void;
}) {
  const addCurah = useCart((s) => s.addCurah);
  const fractions =
    useGetKasirSettings({ query: { staleTime: 60_000 } }).data
      ?.curahFractions ?? [];
  const [mode, setMode] = useState<Mode>("berat");
  const [berat, setBerat] = useState("");
  const [nominal, setNominal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Satu penjaga untuk kedua kolom: hanya kolom mode aktif yang tampil.
  const guard = useScanGuard(mode === "berat" ? setBerat : setNominal);

  const unit = match.product.units.find((u) => u.id === match.unitId);
  // Tab/ fokus: input aktif selalu terfokus saat mode berganti.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fokus dipicu pergantian mode
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);
  if (!unit) return null;

  const unitLabel: "kg" | "L" = match.product.baseUnit === "ml" ? "L" : "kg";
  const priced = compute(unit, mode, mode === "berat" ? berat : nominal);

  function submit() {
    if (!priced) return;
    addCurah(
      match,
      mode === "berat"
        ? { qtyBase: priced.qtyBase }
        : { amount: priced.subtotal },
    );
    onClose();
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader className="flex-row items-baseline justify-between pr-6">
        <DialogTitle>{match.product.name}</DialogTitle>
        <DialogDescription className="tabular-nums">
          {`Rp${formatAngka(unit.price)} / ${unit.name}`}
        </DialogDescription>
      </DialogHeader>
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="h-11 w-full">
          <TabsTrigger value="berat">{`Berat (${unitLabel})`}</TabsTrigger>
          <TabsTrigger value="nominal">Nominal (Rp)</TabsTrigger>
        </TabsList>
        <TabsContent value="berat" className="grid gap-2">
          <label className="sr-only" htmlFor="curah-berat">
            {`Berat (${unitLabel})`}
          </label>
          <div className="relative">
            <Input
              id="curah-berat"
              ref={inputRef}
              inputMode="decimal"
              autoComplete="off"
              value={berat}
              onKeyDown={guard.onKeyDown}
              onChange={(e) => setBerat(e.target.value)}
              className="h-14 border-2 border-primary pr-12 text-2xl font-bold tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
              {unitLabel}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {fractions.map((f) => {
              const active = parseKg(berat) === f;
              return (
                <Button
                  key={f}
                  type="button"
                  variant="outline"
                  aria-label={formatGram(f, unitLabel)}
                  aria-pressed={active}
                  className={cn(
                    "px-0",
                    active &&
                      "border-primary bg-primary-soft font-semibold text-primary",
                  )}
                  onClick={() => {
                    setBerat(kgText(f));
                    setMode("berat");
                    inputRef.current?.focus();
                  }}
                >
                  {fractionLabel(f)}
                </Button>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="nominal" className="grid gap-2">
          <label className="sr-only" htmlFor="curah-nominal">
            Nominal (Rp)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
              Rp
            </span>
            <Input
              id="curah-nominal"
              ref={inputRef}
              inputMode="numeric"
              autoComplete="off"
              value={nominal}
              onKeyDown={guard.onKeyDown}
              onChange={(e) => setNominal(e.target.value)}
              className="h-14 border-2 border-primary pl-11 text-2xl font-bold tabular-nums"
            />
          </div>
          {priced && (
            <p className="text-right text-sm text-muted tabular-nums">
              {formatApproxKg(priced.qtyBase, unitLabel)}
            </p>
          )}
        </TabsContent>
      </Tabs>
      <ScannedAlert show={guard.scanned} />
      <div className="flex items-baseline justify-between rounded-lg bg-success-soft px-3 py-2.5">
        <span className="font-semibold text-primary">HARGA</span>
        <span className="text-[22px] font-extrabold text-primary tabular-nums">
          {priced ? formatRupiah(priced.subtotal) : "—"}
        </span>
      </div>
      <div className="text-right">
        <Button type="submit" size="lg" disabled={!priced}>
          Masukkan
        </Button>
      </div>
    </form>
  );
}

/** Jendela curah: jual per berat atau per nominal; ditutup memicu `onClose`. */
export function CurahDialog({
  match,
  onClose,
}: {
  match: CatalogMatch | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={match !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-sm gap-0 p-4"
        onOpenAutoFocus={(e) => {
          // Fokus ke kolom isian, bukan tab pertama.
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLInputElement>("input")
            ?.focus();
        }}
      >
        {match && (
          <CurahForm
            key={`${match.product.id}:${match.unitId}`}
            match={match}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
