import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  CatalogMatch,
  PriceChange,
  WholesaleTier,
} from "../../../shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "../../../shared/lib/id";
import { priceLine } from "../../../shared/lib/pricing";
import {
  findUnit,
  newLine,
  step,
  withActiveHeld,
  withPriceChanges,
} from "./cart-helpers";

export interface CartLine {
  lineId: string;
  unitId: string;
  productId: string;
  productName: string;
  unitName: string;
  isCurah: boolean;
  baseUnit: "pcs" | "gram" | "ml";
  unitSize: number;
  listPrice: number;
  wholesaleTiers: WholesaleTier[];
  qtyBase: number;
  amount: number | null;
}

export interface HeldCart {
  id: string;
  label: string;
  heldAt: number;
  saleId: string;
  lines: CartLine[];
}

export interface CartData {
  saleId: string;
  lines: CartLine[];
  selectedLineId: string | null;
  lastAddedLineId: string | null;
  printReceipt: boolean | null;
  held: HeldCart[];
  lastChange: number | null;
  heldSeq: number;
}

export type CartState = CartData & {
  addUnit(match: CatalogMatch): void;
  addCurah(
    match: CatalogMatch,
    input: { qtyBase: number } | { amount: number },
  ): void;
  increment(lineId: string): void;
  decrement(lineId: string): void;
  remove(lineId: string): void;
  select(lineId: string | null): void;
  selectNext(): void;
  selectPrev(): void;
  setPrintReceipt(value: boolean): void;
  applyPriceChanges(changes: PriceChange[]): void;
  completeSale(change: number): void;
  clearLastChange(): void;
  hold(): void;
  resume(heldId: string): void;
};

function initialData(): CartData {
  return {
    saleId: newId(),
    lines: [],
    selectedLineId: null,
    lastAddedLineId: null,
    printReceipt: null,
    held: [],
    lastChange: null,
    heldSeq: 0,
  };
}

export function createCartStore(storage: Storage = localStorage) {
  return create<CartState>()(
    persist(
      (set) => ({
        ...initialData(),

        addUnit(match) {
          if (match.product.isCurah) return;
          const unit = findUnit(match);
          set((d) => {
            const existing = d.lines.find((l) => l.unitId === unit.id);
            if (existing) {
              return {
                lines: d.lines.map((l) =>
                  l.lineId === existing.lineId
                    ? { ...l, qtyBase: l.qtyBase + l.unitSize }
                    : l,
                ),
                selectedLineId: existing.lineId,
                lastAddedLineId: existing.lineId,
                lastChange: null,
              };
            }
            const line = newLine(match, unit.unitSize, null);
            return {
              lines: [...d.lines, line],
              selectedLineId: line.lineId,
              lastAddedLineId: line.lineId,
              lastChange: null,
            };
          });
        },

        addCurah(match, input) {
          const unit = findUnit(match);
          const p = priceLine(unit, input);
          const line = newLine(
            match,
            p.qtyBase,
            "amount" in input ? input.amount : null,
          );
          set((d) => ({
            lines: [...d.lines, line],
            selectedLineId: line.lineId,
            lastAddedLineId: line.lineId,
            lastChange: null,
          }));
        },

        increment(lineId) {
          set((d) => ({
            lines: d.lines.map((l) =>
              l.lineId === lineId && !l.isCurah
                ? { ...l, qtyBase: l.qtyBase + l.unitSize }
                : l,
            ),
          }));
        },

        decrement(lineId) {
          set((d) => ({
            lines: d.lines.map((l) =>
              l.lineId === lineId && !l.isCurah && l.qtyBase > l.unitSize
                ? { ...l, qtyBase: l.qtyBase - l.unitSize }
                : l,
            ),
          }));
        },

        remove(lineId) {
          set((d) => ({
            lines: d.lines.filter((l) => l.lineId !== lineId),
            selectedLineId:
              d.selectedLineId === lineId ? null : d.selectedLineId,
            lastAddedLineId:
              d.lastAddedLineId === lineId ? null : d.lastAddedLineId,
          }));
        },

        select(lineId) {
          set({ selectedLineId: lineId });
        },
        selectNext() {
          set((d) => ({ selectedLineId: step(d, 1) }));
        },
        selectPrev() {
          set((d) => ({ selectedLineId: step(d, -1) }));
        },

        setPrintReceipt(value) {
          set({ printReceipt: value });
        },

        applyPriceChanges(changes) {
          set((d) => ({ lines: withPriceChanges(d.lines, changes) }));
        },

        completeSale(change) {
          set({
            lines: [],
            saleId: newId(),
            lastChange: change,
            printReceipt: null,
            selectedLineId: null,
            lastAddedLineId: null,
          });
        },
        clearLastChange() {
          set({ lastChange: null });
        },

        hold() {
          set((d) =>
            d.lines.length === 0
              ? d
              : {
                  ...withActiveHeld(d),
                  lines: [],
                  saleId: newId(),
                  printReceipt: null,
                  selectedLineId: null,
                  lastAddedLineId: null,
                },
          );
        },

        resume(heldId) {
          set((d) => {
            const target = d.held.find((h) => h.id === heldId);
            if (!target) return d;
            const rest = { ...d, held: d.held.filter((h) => h.id !== heldId) };
            return {
              ...withActiveHeld(rest),
              saleId: target.saleId,
              lines: target.lines,
              printReceipt: null,
              selectedLineId: null,
              lastAddedLineId: null,
              lastChange: null,
            };
          });
        },
      }),
      {
        name: "kasir.cart",
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (s): CartData => ({
          saleId: s.saleId,
          lines: s.lines,
          selectedLineId: s.selectedLineId,
          lastAddedLineId: s.lastAddedLineId,
          printReceipt: s.printReceipt,
          held: s.held,
          lastChange: s.lastChange,
          heldSeq: s.heldSeq,
        }),
      },
    ),
  );
}

export const useCart = createCartStore();
