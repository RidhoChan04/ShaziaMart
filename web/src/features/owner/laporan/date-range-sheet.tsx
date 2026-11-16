import { TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { checkRange } from "@/shared/lib/report-period";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

const inputClass =
  "h-11 w-full rounded-md border border-border bg-transparent px-3 text-[17px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Lembar bawah `Pilih tanggal` (periode Tanggal, maks. 92 hari); `trigger` = segmen Tanggal. */
export function DateRangeSheet({
  trigger,
  from,
  to,
  today,
  onSubmit,
}: {
  trigger: ReactNode;
  from: string;
  to: string;
  today: string;
  onSubmit: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dari, setDari] = useState(from);
  const [sampai, setSampai] = useState(to);
  const error = checkRange("tanggal", dari, sampai, today);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDari(from);
          setSampai(to > today ? today : to);
        }
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">Pilih tanggal</SheetTitle>
        <SheetDescription className="sr-only">
          Rentang tanggal laporan, paling lama 92 hari
        </SheetDescription>
        <div className="grid gap-1.5">
          <label htmlFor="laporan-dari" className="text-[15px] font-semibold">
            Dari
          </label>
          <input
            id="laporan-dari"
            type="date"
            value={dari}
            max={today}
            onChange={(e) => setDari(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="laporan-sampai" className="text-[15px] font-semibold">
            Sampai
          </label>
          <input
            id="laporan-sampai"
            type="date"
            value={sampai}
            max={today}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "laporan-tanggal-galat" : undefined}
            onChange={(e) => setSampai(e.target.value)}
            className={cn(inputClass, error && "border-danger")}
          />
          {error && (
            <p
              id="laporan-tanggal-galat"
              className="flex items-center gap-1.5 text-[13px] font-medium text-danger"
            >
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
              {error}
            </p>
          )}
        </div>
        <Button
          className="h-12 w-full text-[17px]"
          disabled={error !== null}
          onClick={() => {
            onSubmit(dari, sampai);
            setOpen(false);
          }}
        >
          Tampilkan
        </Button>
      </SheetContent>
    </Sheet>
  );
}
