import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { Card } from "../receipt/form-ui";
import { qtyText } from "./count-model";
import type { OpnameDraft } from "./opname-draft-types";

const rowCls =
  "flex min-h-14 w-full min-w-0 items-center justify-between gap-3 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset";

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const name = `${title} ${count}`;
  return (
    <section aria-label={name} className="mt-5">
      <h2 className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
        {name}
      </h2>
      <Card>{children}</Card>
    </section>
  );
}

/** Barang belum dihitung (ketuk untuk membuka) lalu yang sudah (jumlah di kanan, ketuk untuk membuka ulang). */
export function CountList({
  draft,
  currentId,
  onOpen,
}: {
  draft: OpnameDraft;
  currentId: string | null;
  /** null = hanya baca. */
  onOpen: ((product: StaffProduct) => void) | null;
}) {
  const todo = draft.products.filter(
    (p) => draft.counts[p.id] === undefined && p.id !== currentId,
  );
  const counted = draft.products.filter(
    (p) => draft.counts[p.id] !== undefined,
  );
  return (
    <>
      {todo.length > 0 && (
        <Group title="Belum dihitung" count={todo.length}>
          {todo.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={onOpen === null}
              onClick={() => onOpen?.(p)}
              className={rowCls}
            >
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
            </button>
          ))}
        </Group>
      )}
      {counted.length > 0 && (
        <Group title="Sudah dihitung" count={counted.length}>
          {counted.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={onOpen === null}
              onClick={() => onOpen?.(p)}
              className={rowCls}
            >
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {qtyText(p, draft.counts[p.id]?.qtyBase ?? 0)}
              </span>
            </button>
          ))}
        </Group>
      )}
    </>
  );
}
