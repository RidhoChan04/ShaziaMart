import type {
  NewProductInput,
  ReceiptError,
  StaffUnit,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "@/shared/lib/business-day";
import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import {
  type CheckLine,
  type DraftLine,
  newProductUnits,
  receiptLineTotal,
  validateReceipt,
} from "@/shared/lib/receipt-rules";

export type UnitOption = {
  unitId: string;
  label: string;
  unitSize: number;
  perEceran: number;
};

/** Pilihan `Satuan di nota`: units[0] = eceran, sisanya "{nama} (isi {n})". */
export function unitOptions(units: readonly StaffUnit[]): UnitOption[] {
  const base = units[0]?.unitSize ?? 1;
  return units.map((u, i) => {
    const perEceran = u.unitSize / base;
    return {
      unitId: u.id,
      label: i === 0 ? u.name : `${u.name} (isi ${perEceran})`,
      unitSize: u.unitSize,
      perEceran,
    };
  });
}

/** Setara eceran, hanya untuk satuan besar: "= 80 pcs". */
export function equivalence(
  qty: number,
  option: UnitOption,
  eceran: StaffUnit,
): string | null {
  if (option.perEceran <= 1) return null;
  return `= ${formatQty(qty * option.unitSize, eceran.unitSize, eceran.name)}`;
}

/** Harga beli yang diketik; kosong → null, bukan angka → -1 (ditolak aturan nota). */
export function parseCost(text: string): number | null {
  if (text.trim() === "") return null;
  return parseRupiah(text) ?? -1;
}

function unitLabel(line: DraftLine): string {
  if (line.newProduct) return line.newProduct.notaUnit.trim();
  return line.product?.units.find((u) => u.id === line.unitId)?.name ?? "";
}

export function lineSummary(line: DraftLine): {
  title: string;
  detail: string;
  subtotal: number | null;
} {
  const cost = parseCost(line.unitCostText);
  const valid = cost !== null && cost >= 0;
  let subtotal: number | null = null;
  if (valid) {
    try {
      subtotal = receiptLineTotal(line.qty, cost);
    } catch {
      subtotal = null;
    }
  }
  const price = valid ? formatRupiah(cost) : "—";
  const ed = line.expiryDate ? ` · ED ${formatIsoDate(line.expiryDate)}` : "";
  return {
    title: line.newProduct?.name.trim() || line.product?.name || "",
    detail: `${line.qty} ${unitLabel(line)} × ${price}${ed}`,
    subtotal,
  };
}

type DraftNewProduct = NonNullable<DraftLine["newProduct"]>;

/** Isian teks barang baru → masukan kontrak; Isi 1 bila satuan nota sama dengan Dijual per. */
function newProductInput(n: DraftNewProduct): NewProductInput {
  const same =
    n.sellUnit.trim().toLowerCase() === n.notaUnit.trim().toLowerCase();
  const barcode = n.barcode.trim();
  return {
    name: n.name,
    sellUnit: n.sellUnit,
    notaUnit: n.notaUnit,
    notaUnitSize: same ? 1 : Number(n.notaUnitSize.trim() || "0"),
    barcode: barcode === "" ? null : barcode,
  };
}

/** Setara eceran untuk barang baru ("= 48 botol"); null bila satuan nota = Dijual per atau Isi belum sah. */
export function newProductEquivalence(
  qty: number,
  n: DraftNewProduct,
): string | null {
  const input = newProductInput(n);
  if (!Number.isSafeInteger(input.notaUnitSize) || input.notaUnitSize < 2) {
    return null;
  }
  try {
    const units = newProductUnits(input);
    if (units === null || units.nota === null) return null;
    const { eceran, nota } = units;
    return equivalence(
      qty,
      {
        unitId: "",
        label: nota.name,
        unitSize: nota.unitSize,
        perEceran: nota.unitSize / eceran.unitSize,
      },
      { id: "", name: eceran.name, unitSize: eceran.unitSize, barcodes: [] },
    );
  } catch {
    return null;
  }
}

/** Baris draf (isian teks) → baris aturan nota; harga bukan angka → -1 agar ditolak aturan. */
export function toCheckLine(line: DraftLine): CheckLine {
  return {
    lineId: line.lineId,
    productId: line.product?.id ?? null,
    unitId: line.unitId,
    newProduct: line.newProduct && newProductInput(line.newProduct),
    qty: line.qty,
    unitCost: parseCost(line.unitCostText),
    expiryDate: line.expiryDate,
  };
}

const DAY = "2000-01-01";

/**
 * Masalah satu baris (aturan nota yang sama, pesan dari receipt-rules). `others` = baris
 * lain di nota, untuk nama/barcode kembar (ditandai pada baris ini, yang diperiksa terakhir).
 */
export function lineProblems(
  line: DraftLine,
  others: readonly DraftLine[] = [],
): ReceiptError[] {
  const errors = validateReceipt(
    {
      supplierName: "-",
      notaDate: DAY,
      lines: [...others.map(toCheckLine), toCheckLine(line)],
      payment: {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: DAY,
      },
    },
    { today: DAY, shiftOpen: false },
  );
  return errors.filter((e) => e.lineId === line.lineId);
}
