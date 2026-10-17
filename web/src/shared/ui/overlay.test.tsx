import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";

test("Dialog punya tombol Tutup berbahasa Indonesia", () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Judul</DialogTitle>
        <DialogDescription>Isi</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByRole("button", { name: "Tutup" })).toBeInTheDocument();
});

test("Sheet punya tombol Tutup berbahasa Indonesia", () => {
  render(
    <Sheet open>
      <SheetContent>
        <SheetTitle>Judul</SheetTitle>
        <SheetDescription>Isi</SheetDescription>
      </SheetContent>
    </Sheet>,
  );
  expect(screen.getByRole("button", { name: "Tutup" })).toBeInTheDocument();
});
