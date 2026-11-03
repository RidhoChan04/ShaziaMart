import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { installCamera } from "@/test/camera";
import { renderApp } from "@/test/render-app";

beforeEach(async () => {
  await ownerLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SCAN = { name: "Scan dengan kamera" };

async function openForm() {
  const utils = renderApp("/owner/barang/baru");
  await screen.findByRole("heading", { name: "Barang baru" });
  return utils;
}
const section = (name: string | RegExp) => screen.getByRole("region", { name });

test("tanpa BarcodeDetector → tidak ada tombol kamera di form maupun daftar", async () => {
  const { unmount } = await openForm();
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByRole("button", SCAN)).toBeNull();
  unmount();
  renderApp("/owner/barang");
  await screen.findByRole("button", { name: /^Semua \d+$/ });
  expect(screen.queryByRole("button", SCAN)).toBeNull();
});

test("dengan BarcodeDetector (ean_13) → tombol ada di Barcode eceran dan satuan besar", async () => {
  installCamera();
  await openForm();
  await waitFor(() =>
    expect(screen.getAllByRole("button", SCAN)).toHaveLength(2),
  );
  expect(within(section("Eceran")).getByRole("button", SCAN)).toBeVisible();
  expect(
    within(section(/^Satuan besar/)).getByRole("button", SCAN),
  ).toBeVisible();
});

test("form: scan di Barcode eceran mengisi 8996001600269, menutup kamera, fokus ke Harga modal", async () => {
  const user = userEvent.setup();
  const cam = installCamera();
  await openForm();
  const eceran = section("Eceran");
  await user.click(await within(eceran).findByRole("button", SCAN));
  expect(await screen.findByText("Barcode eceran")).toBeVisible();
  cam.state.detections = ["ABC", "8996001600269"];
  await waitFor(() =>
    expect(within(eceran).getByLabelText("Barcode")).toHaveValue(
      "8996001600269",
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(cam.track.stop).toHaveBeenCalled();
  await waitFor(() =>
    expect(within(eceran).getByLabelText("Harga modal")).toHaveFocus(),
  );
});

test("form: scan di satuan besar mengisi barcode dus 14 digit", async () => {
  const user = userEvent.setup();
  const cam = installCamera();
  await openForm();
  const besar = section(/^Satuan besar/);
  await user.click(await within(besar).findByRole("button", SCAN));
  expect(await screen.findByText("Barcode satuan besar")).toBeVisible();
  cam.state.detections = ["18996001600266"];
  await waitFor(() =>
    expect(within(besar).getByLabelText("Barcode")).toHaveValue(
      "18996001600266",
    ),
  );
});

test("form: Ketik manual menutup kamera dan memfokus isian Barcode", async () => {
  const user = userEvent.setup();
  installCamera();
  await openForm();
  const eceran = section("Eceran");
  await user.click(await within(eceran).findByRole("button", SCAN));
  await user.click(await screen.findByRole("button", { name: "Ketik manual" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(within(eceran).getByLabelText("Barcode")).toHaveFocus(),
  );
});

test("daftar: hasil scan mengisi kolom cari (q) dan menyaring", async () => {
  const user = userEvent.setup();
  const cam = installCamera();
  const { router } = renderApp("/owner/barang");
  await screen.findByRole("button", { name: /^Semua \d+$/ });
  await user.click(await screen.findByRole("button", SCAN));
  expect(await screen.findByText("Cari barang")).toBeVisible();
  cam.state.detections = ["089686010947"];
  const search = screen.getByLabelText("Cari nama atau barcode");
  await waitFor(() => expect(search).toHaveValue("089686010947"));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ q: "089686010947" }),
  );
  expect(
    await screen.findByRole("link", { name: /^Indomie Goreng/ }),
  ).toBeVisible();
});

test.each([
  [
    "Batal",
    (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("button", { name: "Batal" })),
  ],
  [
    "Esc",
    (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}"),
  ],
])(
  "form: %s menutup kamera dan mengembalikan fokus ke tombol 'Scan dengan kamera'",
  async (_, close) => {
    const user = userEvent.setup();
    installCamera();
    await openForm();
    const trigger = await within(section("Eceran")).findByRole("button", SCAN);
    await user.click(trigger);
    expect(await screen.findByText("Barcode eceran")).toBeVisible();
    await close(user);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
);
