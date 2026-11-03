import { Link } from "@tanstack/react-router";
import { Truck } from "lucide-react";

/** Beranda orang toko: tugas utama sebagai kartu besar (kedaluwarsa & menipis menyusul di F3b-2b). */
export function StaffBerandaPage() {
  return (
    <Link
      to="/staff/masuk/baru"
      className="flex min-h-28 max-w-md flex-col justify-between gap-3 rounded-lg bg-linear-155 from-primary to-primary-deep p-4 text-primary-foreground shadow-sm transition-transform duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-md bg-primary-foreground/20"
      >
        <Truck className="size-5" />
      </span>
      <span>
        <span className="block text-[17px] font-bold tracking-[-0.015em]">
          Barang masuk
        </span>
        <span className="text-[13px]">Catat nota supplier</span>
      </span>
    </Link>
  );
}
