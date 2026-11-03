import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { server } from "@/mocks/node";
import {
  capturePosts,
  DRAFT_ID,
  loginRina,
  NOW,
  renderForm,
  storeWithDraft,
} from "./form-test-kit";

const BAYAR = `/staff/masuk/baru?draf=${DRAFT_ID}&langkah=bayar`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  toast.dismiss();
  server.events.removeAllListeners();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const radio = (name: string) => screen.findByRole("radio", { name });

test("bayar dengan shift: '3 barang' 'Rp1.442.000'; default Bayar sekarang/Tunai/Dari laci kasir + catatan laci; Transfer → 'Uang dari' hilang", async () => {
  await loginRina(true);
  renderForm(await storeWithDraft(), BAYAR);
  const user = userEvent.setup();
  expect(await screen.findByText("3 barang")).toBeInTheDocument();
  expect(screen.getByText("Rp1.442.000")).toBeInTheDocument();
  expect(await radio("Bayar sekarang")).toBeChecked();
  expect(await radio("Tunai")).toBeChecked();
  expect(await radio("Dari laci kasir")).toBeChecked();
  expect(await radio("Dari laci kasir")).toBeEnabled();
  expect(
    await screen.findByText(
      "Dicatat sebagai uang keluar di shift Rina (buka 12.00). Di tutup shift muncul Bayar supplier −Rp1.442.000.",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Transfer" }));
  expect(screen.queryByRole("radio", { name: "Dari laci kasir" })).toBeNull();
  expect(screen.queryByText(/Dicatat sebagai uang keluar/)).toBeNull();
});

test("bayar tanpa shift: 'Dari laci kasir' nonaktif + 'Tidak ada shift buka', tak ada pilihan terpilih; Simpan menolak sampai staf memilih Uang pemilik", async () => {
  await loginRina(false);
  const bodies = capturePosts();
  const { store } = renderForm(await storeWithDraft(), BAYAR);
  const user = userEvent.setup();
  await waitFor(async () =>
    expect(await radio("Dari laci kasir")).toBeDisabled(),
  );
  expect(screen.getByText("Tidak ada shift buka")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Uang pemilik" })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
  expect(
    await screen.findByText(
      "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
    ),
  ).toBeInTheDocument();
  expect(bodies).toHaveLength(0);
  expect((await store.get(DRAFT_ID))?.status).toBe("editing");
  await user.click(screen.getByRole("radio", { name: "Uang pemilik" }));
  await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]).toMatchObject({
    payment: { timing: "sekarang", method: "tunai", cashSource: "pemilik" },
  });
});

test("Bayar nanti: chip '14 hari' → 'Jatuh tempo' '16 Nov 2026'; catatan Utang supplier; body nanti tanpa cara bayar", async () => {
  await loginRina(true);
  const bodies = capturePosts();
  renderForm(await storeWithDraft(), BAYAR);
  const user = userEvent.setup();
  await user.click(await radio("Bayar nanti"));
  await user.click(screen.getByRole("button", { name: "7 hari" }));
  expect(screen.getByText("9 Nov 2026")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "14 hari" }));
  expect(screen.getByText("Jatuh tempo")).toBeInTheDocument();
  expect(screen.getByText("16 Nov 2026")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "14 hari" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("Utang supplier")).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Tunai" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Simpan barang masuk" }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]).toMatchObject({
    payment: {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-11-16",
    },
  });
});
