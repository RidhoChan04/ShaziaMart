import type { StaffOpnameItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import {
  CHOOSABLE_REASONS,
  OPNAME_REASON_LABEL,
} from "@/shared/lib/stock-rules";

/** Pilihan staf untuk satu barang; `receiptId` hanya berarti untuk `salah_input` (null = tidak tahu notanya). */
export type ReasonChoice = {
  reason: (typeof CHOOSABLE_REASONS)[number];
  receiptId: string | null;
};

const CHIP =
  "flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-[15px] font-medium peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary";

function Radio({
  name,
  label,
  checked,
  onSelect,
  className,
}: {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
  className: string;
}) {
  return (
    <label className="min-w-0">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span className={className}>{label}</span>
    </label>
  );
}

/** Empat chip alasan (radio); `Salah input sebelumnya` membuka pilihan nota rujukan (J4). */
export function ReasonPicker({
  item,
  choice,
  onChange,
}: {
  item: StaffOpnameItem;
  choice: ReasonChoice | undefined;
  onChange: (next: ReasonChoice) => void;
}) {
  const reasonName = `alasan-${item.productId}`;
  const receiptName = `nota-${item.productId}`;
  const pick = (reason: ReasonChoice["reason"]) =>
    onChange({ reason, receiptId: null });
  return (
    <div className="grid gap-3">
      <div
        role="radiogroup"
        aria-label={`Alasan ${item.productName}`}
        className="flex flex-wrap gap-2"
      >
        {CHOOSABLE_REASONS.map((reason) => (
          <Radio
            key={reason}
            name={reasonName}
            label={OPNAME_REASON_LABEL[reason]}
            checked={choice?.reason === reason}
            onSelect={() => pick(reason)}
            className={CHIP}
          />
        ))}
      </div>
      {choice?.reason === "salah_input" && (
        <div className="grid gap-1.5">
          <span
            id={`${receiptName}-label`}
            className="text-[13px] font-medium text-muted"
          >
            Nota yang salah
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${receiptName}-label`}
            className="grid gap-1.5"
          >
            {item.receiptOptions.map((o) => (
              <Radio
                key={o.receiptId}
                name={receiptName}
                label={`${o.supplierName} · nota ${formatIsoDate(o.notaDate)}`}
                checked={choice.receiptId === o.receiptId}
                onSelect={() =>
                  onChange({ reason: "salah_input", receiptId: o.receiptId })
                }
                className={cn(CHIP, "justify-start rounded-lg text-left")}
              />
            ))}
            <Radio
              name={receiptName}
              label="Tidak tahu notanya"
              checked={choice.receiptId === null}
              onSelect={() =>
                onChange({ reason: "salah_input", receiptId: null })
              }
              className={cn(CHIP, "justify-start rounded-lg text-left")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
