import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { staffLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { installCamera } from "@/test/camera";
import { renderWithQuery } from "@/test/render-app";
import { LineSheet } from "./line-sheet";

beforeEach(async () => {
  await staffLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type HostProps = {
  line?: DraftLine | null;
  locked?: boolean;
  otherLines?: readonly DraftLine[];
  onSave?: (line: DraftLine) => void;
  onRemove?: (() => void) | null;
};

function Host({
  line = null,
  locked = false,
  otherLines = [],
  onSave = () => {},
  onRemove = null,
}: HostProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Buka lembar
      </button>
      <LineSheet
        open={open}
        line={line}
        locked={locked}
        otherLines={otherLines}
        onSave={(l) => {
          onSave(l);
          setOpen(false);
        }}
        onRemove={onRemove}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

async function openSheet(props: HostProps = {}) {
  const user = userEvent.setup();
  renderWithQuery(<Host {...props} />);
  await user.click(screen.getByRole("button", { name: "Buka lembar" }));
  const sheet = await screen.findByRole("dialog");
  return { user, sheet: within(sheet) };
}

const SEARCH = "Cari nama atau barcode";
const SCAN = { name: "Scan barcode dengan kamera" };

test("cari 'indomie' → pilih → 'Mi Instan'; Satuan di nota 'dus (isi 40)'; + → 2 → '= 80 pcs'; 'Harga beli / dus' 112.000 → 'Subtotal' 'Rp224.000'; ED 2027-04-20 → Tambahkan ke nota → onSave {unitId: dus, qty:2, unitCostText:'112.000', expiryDate:'2027-04-20'}", async () => {
  const onSave = vi.fn();
  const { user, sheet } = await openSheet({ onSave });
  await user.type(sheet.getByLabelText(SEARCH), "indomie goreng");
  await user.click(
    await sheet.findByRole("button", { name: /Indomie Goreng/ }),
  );
  expect(sheet.getByText("Mi Instan")).toBeVisible();
  expect(sheet.getByRole("radio", { name: "dus (isi 40)" })).toBeChecked();
  expect(sheet.getByLabelText("Jumlah")).toHaveFocus();
  await user.click(sheet.getByRole("button", { name: "Tambah jumlah" }));
  expect(sheet.getByLabelText("Jumlah")).toHaveValue("2");
  expect(sheet.getByText("= 80 pcs")).toBeVisible();
  await user.type(sheet.getByLabelText("Harga beli / dus"), "112.000");
  expect(sheet.getByRole("status", { name: "Subtotal" })).toHaveTextContent(
    "Rp224.000",
  );
  await user.type(sheet.getByLabelText("Kedaluwarsa"), "2027-04-20");
  await user.click(sheet.getByRole("button", { name: "Tambahkan ke nota" }));
  expect(onSave).toHaveBeenCalledOnce();
  const saved = onSave.mock.calls[0]?.[0] as DraftLine;
  expect(saved).toMatchObject({
    qty: 2,
    unitCostText: "112.000",
    expiryDate: "2027-04-20",
    newProduct: null,
  });
  expect(saved.product?.name).toBe("Indomie Goreng");
  expect(saved.unitId).toBe(
    saved.product?.units.find((u) => u.name === "dus")?.id,
  );
});

test("memilih satuan eceran mengganti label harga dan menghapus setara", async () => {
  const { user, sheet } = await openSheet();
  await user.type(sheet.getByLabelText(SEARCH), "indomie goreng");
  await user.click(
    await sheet.findByRole("button", { name: /Indomie Goreng/ }),
  );
  await user.click(sheet.getByRole("radio", { name: "pcs" }));
  expect(sheet.getByLabelText("Harga beli / pcs")).toBeVisible();
  expect(sheet.queryByText(/^= /)).toBeNull();
});

test("scan kamera palsu '089686010947' → Indomie langsung terpilih", async () => {
  const cam = installCamera();
  const { user, sheet } = await openSheet();
  await user.click(await sheet.findByRole("button", SCAN));
  cam.state.detections = ["089686010947"];
  expect(await sheet.findByLabelText("Jumlah")).toBeVisible();
  expect(sheet.getByText("Indomie Goreng")).toBeVisible();
  expect(sheet.getByText("Mi Instan")).toBeVisible();
  expect(sheet.getByRole("radio", { name: "dus (isi 40)" })).toBeChecked();
  await waitFor(() => expect(sheet.getByLabelText("Jumlah")).toHaveFocus());
});

test("'teh botol' tanpa hasil → 'Tidak ada barang yang cocok' → 'Barang baru: teh botol' → Dijual per 'botol', Satuan di nota 'dus', Isi 24, harga 96.000, Jumlah 2 → 'Rp192.000', '= 48 botol'", async () => {
  server.use(
    http.get("/api/staff/products", () =>
      HttpResponse.json([] satisfies StaffProduct[]),
    ),
  );
  const onSave = vi.fn();
  const { user, sheet } = await openSheet({ onSave });
  await user.type(sheet.getByLabelText(SEARCH), "teh botol");
  expect(await sheet.findByText("Tidak ada barang yang cocok")).toBeVisible();
  await user.click(
    sheet.getByRole("button", { name: "Barang baru: teh botol" }),
  );
  expect(sheet.getByLabelText("Nama")).toHaveValue("teh botol");
  await user.type(sheet.getByLabelText("Dijual per"), "botol");
  expect(sheet.getByLabelText("Satuan di nota")).toHaveValue("botol");
  expect(sheet.queryByLabelText("Isi")).toBeNull();
  await user.clear(sheet.getByLabelText("Satuan di nota"));
  await user.type(sheet.getByLabelText("Satuan di nota"), "dus");
  await user.type(sheet.getByLabelText("Isi"), "24");
  expect(sheet.getByText("botol per dus")).toBeVisible();
  await user.type(sheet.getByLabelText("Harga beli / dus"), "96.000");
  await user.click(sheet.getByRole("button", { name: "Tambah jumlah" }));
  expect(sheet.getByRole("status", { name: "Subtotal" })).toHaveTextContent(
    "Rp192.000",
  );
  expect(sheet.getByText("= 48 botol")).toBeVisible();
  expect(
    sheet.getByText(
      "Harga jual diisi pemilik. Barang ini belum bisa dijual di kasir sampai harga jual diisi.",
    ),
  ).toBeVisible();
  await user.click(sheet.getByRole("button", { name: "Tambahkan ke nota" }));
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({
    product: null,
    unitId: null,
    qty: 2,
    unitCostText: "96.000",
    newProduct: {
      name: "teh botol",
      sellUnit: "botol",
      notaUnit: "dus",
      notaUnitSize: "24",
    },
  });
});

test("validasi: harga kosong → 'Harga beli belum diisi'; Isi 1 untuk dus → 'Satuan besar: isi berapa? (min. 2)'; barcode '123' → 'Barcode salah, scan ulang'; tanpa onSave", async () => {
  server.use(
    http.get("/api/staff/products", () =>
      HttpResponse.json([] satisfies StaffProduct[]),
    ),
  );
  const onSave = vi.fn();
  const { user, sheet } = await openSheet({ onSave });
  await user.type(sheet.getByLabelText(SEARCH), "teh botol");
  await user.click(
    await sheet.findByRole("button", { name: "Barang baru: teh botol" }),
  );
  await user.type(sheet.getByLabelText("Dijual per"), "botol");
  await user.clear(sheet.getByLabelText("Satuan di nota"));
  await user.type(sheet.getByLabelText("Satuan di nota"), "dus");
  await user.type(sheet.getByLabelText("Isi"), "1");
  await user.type(sheet.getByLabelText("Barcode"), "123");
  await user.click(sheet.getByRole("button", { name: "Tambahkan ke nota" }));
  expect(sheet.getByText("Satuan besar: isi berapa? (min. 2)")).toBeVisible();
  expect(sheet.getByText("Barcode salah, scan ulang")).toBeVisible();
  expect(sheet.getByText("Harga beli belum diisi")).toBeVisible();
  expect(sheet.getByLabelText("Isi")).toHaveFocus();
  expect(sheet.getByLabelText("Isi")).toBeInvalid();
  expect(onSave).not.toHaveBeenCalled();
});

test("nama barang baru sama dengan baris lain → 'Nama sama dengan baris lain'", async () => {
  server.use(
    http.get("/api/staff/products", () =>
      HttpResponse.json([] satisfies StaffProduct[]),
    ),
  );
  const other: DraftLine = {
    lineId: "l0",
    product: null,
    unitId: null,
    newProduct: {
      name: "Teh Botol",
      sellUnit: "botol",
      notaUnit: "botol",
      notaUnitSize: "",
      barcode: "",
    },
    qty: 1,
    unitCostText: "3.500",
    expiryDate: null,
  };
  const { user, sheet } = await openSheet({ otherLines: [other] });
  await user.type(sheet.getByLabelText(SEARCH), "teh botol");
  await user.click(
    await sheet.findByRole("button", { name: "Barang baru: teh botol" }),
  );
  await user.type(sheet.getByLabelText("Dijual per"), "botol");
  await user.type(sheet.getByLabelText("Harga beli / botol"), "3500");
  await user.click(sheet.getByRole("button", { name: "Tambahkan ke nota" }));
  expect(sheet.getByText("Nama sama dengan baris lain")).toBeVisible();
});

test("tanpa pilihan barang → 'Pilih barang atau buat barang baru' dan fokus ke isian cari", async () => {
  const { user, sheet } = await openSheet();
  await user.click(sheet.getByRole("button", { name: "Tambahkan ke nota" }));
  expect(sheet.getByText("Pilih barang atau buat barang baru")).toBeVisible();
  expect(sheet.getByLabelText(SEARCH)).toHaveFocus();
});

function indomieLine(): DraftLine {
  const dus = { id: "u-dus", name: "dus", unitSize: 40, barcodes: [] };
  const pcs = { id: "u-pcs", name: "pcs", unitSize: 1, barcodes: [] };
  return {
    lineId: "l1",
    product: {
      id: "p1",
      name: "Indomie Goreng",
      category: "Mi Instan",
      baseUnit: "pcs",
      units: [pcs, dus],
    },
    unitId: "u-dus",
    newProduct: null,
    qty: 3,
    unitCostText: "112.000",
    expiryDate: null,
  };
}

test("locked (ubah nota): tanpa 'Ganti barang' dan tanpa 'Hapus baris'; judul 'Ubah barang'", async () => {
  const { sheet } = await openSheet({
    line: indomieLine(),
    locked: true,
    onRemove: () => {},
  });
  expect(sheet.getByRole("heading", { name: "Ubah barang" })).toBeVisible();
  expect(sheet.getByRole("button", { name: "Simpan baris" })).toBeVisible();
  expect(sheet.queryByRole("button", { name: "Ganti barang" })).toBeNull();
  expect(sheet.queryByRole("button", { name: "Hapus baris" })).toBeNull();
  expect(sheet.getByLabelText("Jumlah")).toHaveValue("3");
});

test("ubah baris draf (tidak locked): 'Ganti barang' kembali ke pencarian; 'Hapus baris' memanggil onRemove", async () => {
  const onRemove = vi.fn();
  const { user, sheet } = await openSheet({ line: indomieLine(), onRemove });
  await user.click(sheet.getByRole("button", { name: "Ganti barang" }));
  expect(sheet.getByLabelText(SEARCH)).toHaveFocus();
  expect(sheet.queryByLabelText("Jumlah")).toBeNull();
  await user.click(sheet.getByRole("button", { name: "Hapus baris" }));
  expect(onRemove).toHaveBeenCalledOnce();
});

test("tanpa BarcodeDetector → tidak ada tombol 'Scan barcode dengan kamera'", async () => {
  const { sheet } = await openSheet();
  await new Promise((r) => setTimeout(r, 30));
  expect(sheet.queryByRole("button", SCAN)).toBeNull();
});

test("fokus kembali ke tombol pemicu setelah lembar ditutup", async () => {
  const { user, sheet } = await openSheet();
  await user.click(sheet.getByRole("button", { name: "Tutup" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Buka lembar" })).toHaveFocus(),
  );
});

test("fokus kembali ke pemicu setelah menyimpan baris", async () => {
  const { user, sheet } = await openSheet({ line: indomieLine() });
  await user.click(sheet.getByRole("button", { name: "Simpan baris" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Buka lembar" })).toHaveFocus(),
  );
});
