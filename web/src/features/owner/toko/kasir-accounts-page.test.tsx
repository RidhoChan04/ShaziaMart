import type { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { invalid } from "@/mocks/handlers/respond";
import {
  loginWithShift,
  ownerLogin,
  userId,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";

/** Kamis 5 Nov 2026, 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await ownerLogin();
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
});

const list = () => screen.findByRole("heading", { name: "Akun kasir" });
const detail = (name: string) => `/owner/lainnya/kasir/${userId(name)}`;
const rows = () =>
  within(screen.getByRole("region", { name: "Kasir" })).getAllByRole(
    "listitem",
  );

test("daftar: Aktif, Sedang shift, Terkunci sampai jam, Nonaktif di bawah", async () => {
  await loginWithShift(); // Rina sedang shift
  mockDb.update((s) => {
    s.users.push({
      id: "k-dedi",
      name: "Dedi",
      role: "kasir",
      pin: "222222",
      active: false,
    });
    s.users.push({
      id: "k-sari",
      name: "Sari",
      role: "kasir",
      pin: "333333",
      active: true,
    });
    s.staffPinFailures[userId("Budi")] = {
      count: 5,
      lockedUntil: NOW + 35 * 60_000,
    };
  });
  renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Sedang shift");
  const text = rows().map((li) => li.textContent);
  expect(text).toEqual([
    `BudiTerkunci sampai 10.35`,
    "RinaSedang shift",
    "SariAktif",
    "DediNonaktif",
  ]);
});

test("tambah: PIN beda ditolak (PIN tidak sama), lalu tersimpan dan muncul", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  await user.click(screen.getByRole("button", { name: "Tambah kasir" }));
  const dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "Wulan");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "123456");
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "123450");
  expect(within(dialog).getByText("PIN tidak sama")).toBeInTheDocument();
  const save = within(dialog).getByRole("button", { name: "Simpan" });
  expect(save).toBeDisabled();
  await user.clear(within(dialog).getByLabelText("Ulangi PIN"));
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "123456");
  expect(save).toBeEnabled();
  await user.click(save);
  expect(await screen.findByText("Wulan")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mockDb.get().users.find((u) => u.name === "Wulan")?.pin).toBe(
    "123456",
  );
});

test("tambah: PIN kurang dari 6 angka tidak bisa disimpan", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  await user.click(screen.getByRole("button", { name: "Tambah kasir" }));
  const dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "Wulan");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "12345");
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "12345");
  expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
});

test("tambah: nama kembar -> teks 409 dari server, lembar tetap terbuka", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  await user.click(screen.getByRole("button", { name: "Tambah kasir" }));
  const dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "budi");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "123456");
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "123456");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Nama sudah dipakai",
  );
});

test("tambah: 422 dari server tampil dengan teksnya", async () => {
  server.use(
    http.post("/api/owner/kasir-accounts", () => invalid("Nama 1–30 karakter")),
  );
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  await user.click(screen.getByRole("button", { name: "Tambah kasir" }));
  const dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "Wulan");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "123456");
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "123456");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Nama 1–30 karakter",
  );
});

test("detail aktif: Nonaktifkan minta konfirmasi dengan keterangan, lalu Nonaktif", async () => {
  const user = userEvent.setup();
  renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  const trigger = await screen.findByRole("button", { name: "Nonaktifkan" });
  await user.click(trigger);
  const dialog = await screen.findByRole("alertdialog", {
    name: "Nonaktifkan Budi?",
  });
  expect(
    within(dialog).getByText(
      "Tidak bisa masuk di kasir maupun HP toko. Riwayat tetap tersimpan.",
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Kembali" }));
  expect(mockDb.get().users.find((u) => u.name === "Budi")?.active).toBe(true);
  await user.click(screen.getByRole("button", { name: "Nonaktifkan" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Nonaktifkan",
    }),
  );
  expect(await screen.findByText("Nonaktif")).toBeInTheDocument();
  expect(mockDb.get().users.find((u) => u.name === "Budi")?.active).toBe(false);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Aktifkan lagi" })).toBeEnabled(),
  );
});

test("kasir sedang shift: Nonaktifkan -> Tutup shift {nama} dulu", async () => {
  await loginWithShift();
  const user = userEvent.setup();
  renderApp(detail("Rina"));
  await screen.findByRole("heading", { level: 1, name: "Rina" });
  await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Nonaktifkan",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Tutup shift Rina dulu",
  );
  expect(mockDb.get().users.find((u) => u.name === "Rina")?.active).toBe(true);
});

test("Aktifkan lagi mengaktifkan akun nonaktif", async () => {
  mockDb.update((s) => {
    const u = s.users.find((x) => x.name === "Budi");
    if (u) u.active = false;
  });
  const user = userEvent.setup();
  renderApp(detail("Budi"));
  await user.click(
    await screen.findByRole("button", { name: "Aktifkan lagi" }),
  );
  await waitFor(() =>
    expect(mockDb.get().users.find((u) => u.name === "Budi")?.active).toBe(
      true,
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Nonaktifkan" }),
  ).toBeInTheDocument();
});

test("ubah nama: judul ikut berubah; nama kembar ditolak", async () => {
  const user = userEvent.setup();
  renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  await user.click(await screen.findByRole("button", { name: "Ubah nama" }));
  const dialog = await screen.findByRole("dialog", { name: "Ubah nama" });
  const input = within(dialog).getByLabelText("Nama");
  expect(input).toHaveValue("Budi");
  await user.clear(input);
  await user.type(input, "rina");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Nama sudah dipakai",
  );
  await user.clear(input);
  await user.type(input, "Budi Santoso");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Budi Santoso" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Ubah nama" })).toHaveFocus();
});

test("atur ulang PIN: dua kali sama, PIN tersimpan di server dan tidak tampil lagi", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  await user.click(
    await screen.findByRole("button", { name: "Atur ulang PIN" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Atur ulang PIN",
  });
  await user.type(
    within(dialog).getByLabelText("PIN baru (6 angka)"),
    "654321",
  );
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "654321");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  await waitFor(() =>
    expect(mockDb.get().users.find((u) => u.name === "Budi")?.pin).toBe(
      "654321",
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await expectNoPinInMutationCache(queryClient, "654321");
  // Dibuka lagi: isian kosong, PIN lama tidak dimuat.
  await user.click(screen.getByRole("button", { name: "Atur ulang PIN" }));
  const again = await screen.findByRole("dialog", { name: "Atur ulang PIN" });
  expect(within(again).getByLabelText("PIN baru (6 angka)")).toHaveValue("");
  expect(within(again).getByLabelText("Ulangi PIN")).toHaveValue("");
});

/** Cache mutasi tidak boleh menyimpan PIN (variabel mutasi) setelah lembar ditutup. */
async function expectNoPinInMutationCache(client: QueryClient, pin: string) {
  await waitFor(() => {
    const vars = client
      .getMutationCache()
      .getAll()
      .map((m) => JSON.stringify(m.state.variables ?? null));
    expect(vars.join("|")).not.toContain(pin);
  });
}

test("tambah: Batal mengosongkan nama dan PIN, fokus kembali ke Tambah kasir; PIN tidak tinggal di cache", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  const trigger = screen.getByRole("button", { name: "Tambah kasir" });
  await user.click(trigger);
  let dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "Wulan");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "246810");
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "246810");
  await user.click(within(dialog).getByRole("button", { name: "Batal" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  expect(within(dialog).getByLabelText("Nama")).toHaveValue("");
  expect(within(dialog).getByLabelText("PIN 6 angka")).toHaveValue("");
  expect(within(dialog).getByLabelText("Ulangi PIN")).toHaveValue("");
  await expectNoPinInMutationCache(queryClient, "246810");
});

test("tambah: Esc menutup dan mengosongkan isian", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  const trigger = screen.getByRole("button", { name: "Tambah kasir" });
  await user.click(trigger);
  let dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "Wulan");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "246810");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  expect(within(dialog).getByLabelText("Nama")).toHaveValue("");
  expect(within(dialog).getByLabelText("PIN 6 angka")).toHaveValue("");
});

test("tambah: setelah berhasil, PIN tidak tinggal di cache mutasi", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp("/owner/lainnya/kasir");
  await list();
  await screen.findByText("Budi");
  await user.click(screen.getByRole("button", { name: "Tambah kasir" }));
  const dialog = await screen.findByRole("dialog", { name: "Tambah kasir" });
  await user.type(within(dialog).getByLabelText("Nama"), "Wulan");
  await user.type(within(dialog).getByLabelText("PIN 6 angka"), "135790");
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "135790");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  await screen.findByText("Wulan");
  await expectNoPinInMutationCache(queryClient, "135790");
});

test("atur ulang PIN: Batal mengembalikan fokus ke barisnya dan mengosongkan isian", async () => {
  const user = userEvent.setup();
  const { queryClient } = renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  const trigger = await screen.findByRole("button", {
    name: "Atur ulang PIN",
  });
  await user.click(trigger);
  let dialog = await screen.findByRole("dialog", { name: "Atur ulang PIN" });
  await user.type(
    within(dialog).getByLabelText("PIN baru (6 angka)"),
    "112233",
  );
  await user.click(within(dialog).getByRole("button", { name: "Batal" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Atur ulang PIN" });
  expect(within(dialog).getByLabelText("PIN baru (6 angka)")).toHaveValue("");
  await expectNoPinInMutationCache(queryClient, "112233");
});

test("atur ulang PIN: 422 PIN harus 6 angka dari server tampil", async () => {
  server.use(
    http.post("/api/owner/kasir-accounts/:userId/pin", () =>
      invalid("PIN harus 6 angka"),
    ),
  );
  const user = userEvent.setup();
  renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  await user.click(
    await screen.findByRole("button", { name: "Atur ulang PIN" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Atur ulang PIN" });
  await user.type(
    within(dialog).getByLabelText("PIN baru (6 angka)"),
    "123456",
  );
  await user.type(within(dialog).getByLabelText("Ulangi PIN"), "123456");
  await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "PIN harus 6 angka",
  );
});

test("nonaktifkan: Kembali mengembalikan fokus ke Nonaktifkan; setelah berhasil fokus ke Aktifkan lagi, lalu ke Nonaktifkan", async () => {
  const user = userEvent.setup();
  renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  const trigger = await screen.findByRole("button", { name: "Nonaktifkan" });
  await user.click(trigger);
  let dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Kembali" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan" }));
  const reactivate = await screen.findByRole("button", {
    name: "Aktifkan lagi",
  });
  await waitFor(() => expect(reactivate).toHaveFocus());
  await user.click(reactivate);
  const again = await screen.findByRole("button", { name: "Nonaktifkan" });
  await waitFor(() => expect(again).toHaveFocus());
});

test("detail dibuka langsung: tombol kembali menuju daftar Akun kasir", async () => {
  renderApp(detail("Budi"));
  await screen.findByRole("heading", { level: 1, name: "Budi" });
  expect(screen.getByRole("link", { name: "Akun kasir" })).toHaveAttribute(
    "href",
    "/owner/lainnya/kasir",
  );
});
