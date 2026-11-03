import {
  type LucideIcon,
  PackagePlus,
  PackageX,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";
import { useListOwnerProductMovements } from "@/shared/api/gen/owner/owner";
import type { StockMovement } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { relativeDayTime } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { formatQty } from "@/shared/lib/quantity";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { RowList } from "./section";

type Unit = { name: string; size: number };

type Kind = StockMovement["kind"];

/** Teks, ikon, dan keterangan pencatat per jenis mutasi; barang masuk dicatat orang toko, bukan kasir. */
const KINDS: Record<Kind, { label: string; icon: LucideIcon; by: string }> = {
  jual: { label: "Terjual", icon: ShoppingCart, by: "Kasir " },
  batal: { label: "Penjualan dibatalkan", icon: RotateCcw, by: "Kasir " },
  masuk: { label: "Barang masuk", icon: PackagePlus, by: "" },
  koreksi_masuk: {
    label: "Koreksi barang masuk",
    icon: PackagePlus,
    by: "",
  },
  batal_masuk: { label: "Barang masuk dibatalkan", icon: PackageX, by: "" },
};

/** Satu mutasi stok: `Terjual 2 pcs` / `Barang masuk 80 pcs`, `{waktu} · {pencatat}`, jumlah bertanda. */
export function MovementRow({
  movement,
  unit,
  now,
}: {
  movement: StockMovement;
  unit: Unit;
  now: number;
}) {
  const abs = Math.abs(movement.qtyBase);
  const { label, icon: Icon, by } = KINDS[movement.kind];
  const out = movement.qtyBase < 0;
  const sign = out ? "−" : "+";
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground",
          out ? "bg-muted" : "bg-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">
          {label} {formatQty(abs, unit.size, unit.name)}
        </p>
        <p className="text-[13px] text-muted">
          {relativeDayTime(movement.at, now)} · {by}
          {movement.kasirName}
        </p>
      </div>
      <span
        className={cn(
          "text-[15px] font-semibold tabular-nums",
          !out && "text-primary",
        )}
      >
        {sign}
        {formatQty(abs, unit.size, "").trim()}
      </span>
    </li>
  );
}

function MovementsList({ productId, unit }: { productId: string; unit: Unit }) {
  const movements = useListOwnerProductMovements(productId);
  if (movements.isError) {
    return (
      <p role="alert" className="text-sm font-medium text-danger">
        {pesanError(movements.error)}
      </p>
    );
  }
  if (!movements.data) {
    return (
      <p role="status" className="text-muted">
        Memuat…
      </p>
    );
  }
  if (movements.data.length === 0) {
    return <p className="text-muted">Belum ada penjualan</p>;
  }
  const now = Date.now();
  return (
    <RowList className="overflow-y-auto rounded-lg bg-bg">
      {movements.data.map((m) => (
        <MovementRow key={m.id} movement={m} unit={unit} now={now} />
      ))}
    </RowList>
  );
}

/** Tombol `Lihat semua` + lembar `Riwayat stok`; daftar lengkap dimuat hanya saat lembar dibuka. */
export function MovementsSheet({
  productId,
  unit,
}: {
  productId: string;
  unit: Unit;
}) {
  return (
    <Sheet>
      <SheetTrigger className="min-h-11 rounded-full px-2 text-[15px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary">
        Lihat semua
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85dvh] gap-3 rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-lg"
      >
        <SheetTitle className="text-[20px] font-bold">Riwayat stok</SheetTitle>
        <SheetDescription className="sr-only">
          Penjualan, barang masuk, dan pembatalannya yang mengubah stok barang
          ini
        </SheetDescription>
        <MovementsList productId={productId} unit={unit} />
        <SheetClose asChild>
          <Button variant="outline" className="h-12 w-full text-[17px]">
            Tutup
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
