import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type MockCreditPayment, type MockSale, mockDb } from "@/mocks/db";
import { customerId, ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { getGetOwnerTodaySummaryQueryKey } from "@/shared/api/gen/owner/owner";
import { renderApp, renderWithQuery } from "@/test/render-app";
import { QrisReconcileSheet } from "./qris-reconcile-sheet";

const wib = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 7, min);
/** Kamis 19 Nov 2026 10.00 WIB. */
const NOW = wib(2026, 11, 19, 10);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await ownerLogin();
});

afterEach(() => {
  vi.useRealTimers();
});

let n = 0;
function sale(
  at: number,
  qris: number,
  patch: Partial<MockSale> = {},
): MockSale {
  n += 1;
  return {
    id: `qt-${n}`,
    number: `2026111${n}`,
    createdAt: at,
    kasirName: "Rina",
    shiftId: "sh-1",
    items: [],
    total: qris,
    payments: [{ method: "qris", amount: qris }],
    cashReceived: 0,
    change: 0,
    customerId: null,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: 0,
    lineCosts: [],
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
    creditOverLimit: null,
    ...patch,
  };
}

const voided: Partial<MockSale> = {
  status: "dibatalkan",
  voidedAt: NOW,
  voidedById: "u-rina",
  voidedByName: "Rina",
  voidReason: "Salah input",
  voidChannel: "kasir",
  voidRefund: { cash: 0, qris: 0, qrisSource: "pemilik", drawer: 0 },
};

function repayment(at: number, amount: number): MockCreditPayment {
  n += 1;
  return {
    id: `qp-${n}`,
    customerId: customerId("Bu Tini"),
    amount,
    at,
    channel: "kasir",
    method: "qris",
    createdById: "u-rina",
    createdByName: "Rina",
    shiftId: "sh-1",
    cashReceived: 0,
    change: 0,
    balanceAfter: 0,
    printStatus: "tercetak",
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelledChannel: null,
    cancelReason: null,
  };
}

/**
 * 14 Nov Tidak cocok, 15 Nov Cocok, 16 Nov belum, 17 Nov Cocok lalu total berubah (batal),
 * 18 Nov belum (penjualan + pelunasan + satu batal), hari ini (19 Nov) berjalan.
 */
function plant() {
  mockDb.update((s) => {
    s.qrisSince = "2026-11-14";
    s.sales = [
      sale(wib(2026, 11, 14, 9), 688_000),
      sale(wib(2026, 11, 15, 9), 912_000),
      sale(wib(2026, 11, 16, 9), 853_000),
      sale(wib(2026, 11, 17, 9), 775_500),
      sale(wib(2026, 11, 17, 10), 24_000, voided),
      sale(wib(2026, 11, 18, 8, 12), 27_500),
      sale(wib(2026, 11, 18, 16, 20), 24_000, voided),
      sale(wib(2026, 11, 18, 18, 36), 58_000),
      sale(wib(2026, 11, 19, 9), 1_146_000),
    ];
    s.creditPayments = [repayment(wib(2026, 11, 18, 11, 5), 50_000)];
    const markBase = {
      markedById: "u-owner",
      markedByName: "Pak Ahmad",
      markedAt: wib(2026, 11, 18, 7, 15),
    };
    s.qrisDays = {
      "2026-11-14": {
        date: "2026-11-14",
        status: "tidak_cocok",
        note: "Mutasi kurang",
        markedTotal: 688_000,
        ...markBase,
      },
      "2026-11-15": {
        date: "2026-11-15",
        status: "cocok",
        note: null,
        markedTotal: 912_000,
        ...markBase,
      },
      // Ditandai saat total 799.500, kini 775.500.
      "2026-11-17": {
        date: "2026-11-17",
        status: "cocok",
        note: null,
        markedTotal: 799_500,
        ...markBase,
      },
    };
  });
}

const dayRow = (name: RegExp) => screen.findByRole("button", { name });

describe("QrisPage", () => {
  test("navigator bulan, tiga tanda berikon + teks, perubahan setelah ditandai, hari ini tanpa tombol", async () => {
    plant();
    renderApp("/owner/lainnya/qris");
    expect(await screen.findByText("November 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bulan berikutnya" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Bulan sebelumnya" }),
    ).toBeInTheDocument();

    const hari = within(await screen.findByRole("region", { name: "Hari" }));
    const rows = hari.getAllByRole("listitem");
    // Terbaru di atas: 19, 18, 17, 16, 15, 14.
    expect(rows).toHaveLength(6);
    expect(
      within(rows[0] as HTMLElement).getByText("Hari ini belum selesai"),
    ).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).queryByRole("button")).toBeNull();
    expect(
      within(rows[0] as HTMLElement).getByText("Rp1.146.000"),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText("Belum dicocokkan"),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText(
        "Penjualan Rp85.500 · pelunasan Rp50.000",
      ),
    ).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByText("Belum dicocokkan"),
    ).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByText(
        "Total berubah setelah ditandai",
      ),
    ).toBeInTheDocument();
    expect(
      within(rows[4] as HTMLElement).getByText("Cocok"),
    ).toBeInTheDocument();
    expect(
      within(rows[5] as HTMLElement).getByText("Tidak cocok"),
    ).toBeInTheDocument();
    // Tanda = ikon + teks.
    expect(rows[4]?.querySelector("svg")).not.toBeNull();
    expect(
      screen.queryByText(/Total berubah setelah ditandai/),
    ).toBeInTheDocument();
  });

  test("nama aksesibel baris memuat tanda, rincian, dan keterangan total berubah", async () => {
    plant();
    renderApp("/owner/lainnya/qris");
    const row = await dayRow(/Sel, 17 Nov/);
    expect(row).toHaveAccessibleName(/Rp775\.500/);
    expect(row).toHaveAccessibleName(/Belum dicocokkan/);
    expect(row).toHaveAccessibleName(/Total berubah setelah ditandai/);
    expect(row).toHaveAccessibleName(/Penjualan Rp775\.500/);
    expect(await dayRow(/Min, 15 Nov/)).toHaveAccessibleName(/Cocok/);
    expect(await dayRow(/Sab, 14 Nov/)).toHaveAccessibleName(/Tidak cocok/);
  });

  test("bulan sebelumnya dimuat dari URL dan tombol bulan berikutnya aktif", async () => {
    plant();
    renderApp("/owner/lainnya/qris?bulan=2026-10");
    expect(await screen.findByText("Oktober 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Bulan berikutnya" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Belum ada transaksi QRIS pada bulan ini."),
    ).toBeInTheDocument();
  });

  test("Tidak cocok wajib catatan; sukses menandai, menutup lembar, dan memuat ulang daftar serta ringkasan", async () => {
    plant();
    const user = userEvent.setup();
    const { queryClient } = renderApp("/owner/lainnya/qris");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(await dayRow(/Rab, 18 Nov/));
    const sheet = await screen.findByRole("dialog", {
      name: "QRIS Rab, 18 Nov",
    });
    expect(
      within(sheet).getByText("Dibatalkan: 1 transaksi · Rp24.000"),
    ).toBeInTheDocument();

    await user.click(
      within(sheet).getByRole("button", { name: "Tidak cocok" }),
    );
    expect(
      within(sheet).getByText("Isi catatan bila tidak cocok"),
    ).toBeInTheDocument();
    expect(mockDb.get().qrisDays["2026-11-18"]).toBeUndefined();

    await user.type(
      within(sheet).getByLabelText("Catatan"),
      "Mutasi bank hanya Rp730.000",
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Tidak cocok" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockDb.get().qrisDays["2026-11-18"]).toMatchObject({
      status: "tidak_cocok",
      note: "Mutasi bank hanya Rp730.000",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: getGetOwnerTodaySummaryQueryKey(),
    });
    const row = (await dayRow(/Rab, 18 Nov/)).closest("li") as HTMLElement;
    await waitFor(() =>
      expect(within(row).getByText("Tidak cocok")).toBeInTheDocument(),
    );
  });

  test("Cocok tanpa catatan menandai hari", async () => {
    plant();
    const user = userEvent.setup();
    renderApp("/owner/lainnya/qris");
    await user.click(await dayRow(/Sen, 16 Nov/));
    const sheet = await screen.findByRole("dialog", {
      name: "QRIS Sen, 16 Nov",
    });
    await user.click(within(sheet).getByRole("button", { name: "Cocok" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockDb.get().qrisDays["2026-11-16"]).toMatchObject({
      status: "cocok",
      note: null,
    });
  });

  test("Lihat transaksi: daftar urut jam, penjualan memakai nomor struk, pelunasan nama pelanggan, batal dicoret", async () => {
    plant();
    const user = userEvent.setup();
    renderApp("/owner/lainnya/qris");
    await user.click(await dayRow(/Rab, 18 Nov/));
    const sheet = await screen.findByRole("dialog", {
      name: "QRIS Rab, 18 Nov",
    });
    await user.click(
      within(sheet).getByRole("button", { name: "Lihat transaksi" }),
    );
    const list = within(
      await screen.findByRole("list", { name: "Transaksi QRIS" }),
    );
    const items = list.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("08.12 · Penjualan");
    expect(items[0]).toHaveTextContent("Rp27.500");
    expect(items[1]).toHaveTextContent("11.05 · Pelunasan");
    expect(items[1]).toHaveTextContent("Bu Tini · Rina");
    expect(items[2]).toHaveTextContent("16.20 · Penjualan");
    expect(items[2]).toHaveTextContent("Dibatalkan");
    expect(within(items[2] as HTMLElement).getByText("Rp24.000")).toHaveClass(
      "line-through",
    );
    expect(items[3]).toHaveTextContent("18.36 · Penjualan");
  });
});

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span>{open ? "terbuka" : "tertutup"}</span>
      <QrisReconcileSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe("QrisReconcileSheet", () => {
  test("hari belum dicocokkan lintas bulan, terlama di atas, tanpa tombol tandai semua", async () => {
    plant();
    renderWithQuery(<Harness />);
    const sheet = await screen.findByRole("dialog", { name: "Cocokkan QRIS" });
    const list = within(
      await within(sheet).findByRole("list", { name: "Hari belum dicocokkan" }),
    );
    const rows = list.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Sen, 16 Nov");
    expect(rows[1]).toHaveTextContent("Sel, 17 Nov");
    expect(rows[1]).toHaveTextContent("Total berubah setelah ditandai");
    expect(rows[2]).toHaveTextContent("Rab, 18 Nov");
    expect(
      within(sheet).getByText("3 hari belum dicocokkan"),
    ).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /semua/i })).toBeNull();
  });

  test("tandai satu per satu: hari hilang; Tidak cocok memakai catatan; menutup sendiri saat habis", async () => {
    plant();
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await screen.findByRole("dialog", { name: "Cocokkan QRIS" });
    await user.click(
      await screen.findByRole("button", { name: "Cocok Sen, 16 Nov" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Cocok Sen, 16 Nov" }),
      ).toBeNull(),
    );
    expect(mockDb.get().qrisDays["2026-11-16"]?.status).toBe("cocok");
    expect(screen.getByText("terbuka")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cocok Sel, 17 Nov" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Cocok Sel, 17 Nov" }),
      ).toBeNull(),
    );

    await user.click(
      screen.getByRole("button", { name: "Tidak cocok Rab, 18 Nov" }),
    );
    const mark = await screen.findByRole("dialog", {
      name: "QRIS Rab, 18 Nov",
    });
    await user.type(within(mark).getByLabelText("Catatan"), "Selisih");
    await user.click(within(mark).getByRole("button", { name: "Tidak cocok" }));
    await waitFor(() =>
      expect(screen.getByText("tertutup")).toBeInTheDocument(),
    );
    expect(mockDb.get().qrisDays["2026-11-18"]).toMatchObject({
      status: "tidak_cocok",
      note: "Selisih",
    });
  });

  test("Lihat transaksi membuka daftar transaksi hari itu", async () => {
    plant();
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(
      await screen.findByRole("button", {
        name: "Lihat transaksi Rab, 18 Nov",
      }),
    );
    const list = await screen.findByRole("list", { name: "Transaksi QRIS" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  test("fokus pindah ke baris berikutnya setelah Cocok, dan ke baris berikutnya juga setelah lembar Tidak cocok", async () => {
    plant();
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await screen.findByRole("dialog", { name: "Cocokkan QRIS" });
    await user.click(
      await screen.findByRole("button", { name: "Cocok Sen, 16 Nov" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Lihat transaksi Sel, 17 Nov" }),
      ).toHaveFocus(),
    );
    await user.click(
      screen.getByRole("button", { name: "Tidak cocok Sel, 17 Nov" }),
    );
    const mark = await screen.findByRole("dialog", {
      name: "QRIS Sel, 17 Nov",
    });
    await user.type(within(mark).getByLabelText("Catatan"), "Selisih");
    await user.click(within(mark).getByRole("button", { name: "Tidak cocok" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Lihat transaksi Rab, 18 Nov" }),
      ).toHaveFocus(),
    );
  });

  test("hari terakhir ditandai: fokus ke judul lembar sebelum lembar menutup sendiri tidak jatuh ke body", async () => {
    plant();
    mockDb.update((s) => {
      s.qrisDays["2026-11-16"] = {
        date: "2026-11-16",
        status: "cocok",
        note: null,
        markedById: "u-owner",
        markedByName: "Pak Ahmad",
        markedAt: NOW,
        markedTotal: 853_000,
      };
      s.qrisDays["2026-11-17"] = {
        date: "2026-11-17",
        status: "cocok",
        note: null,
        markedById: "u-owner",
        markedByName: "Pak Ahmad",
        markedAt: NOW,
        markedTotal: 775_500,
      };
    });
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(
      await screen.findByRole("button", { name: "Cocok Rab, 18 Nov" }),
    );
    await waitFor(() =>
      expect(screen.getByText("tertutup")).toBeInTheDocument(),
    );
  });

  test("dibuka dengan daftar kosong: menutup sendiri", async () => {
    plant();
    mockDb.update((s) => {
      s.qrisSince = "2026-11-19";
    });
    renderWithQuery(<Harness />);
    await waitFor(() =>
      expect(screen.getByText("tertutup")).toBeInTheDocument(),
    );
  });

  test("galat memuat: pesan dan Coba lagi memulihkan daftar", async () => {
    plant();
    server.use(
      http.get(
        "/api/owner/qris-days",
        () =>
          HttpResponse.json(
            { code: "SERVER", message: "Gagal" },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const sheet = await screen.findByRole("dialog", { name: "Cocokkan QRIS" });
    await user.click(
      await within(sheet).findByRole("button", { name: "Coba lagi" }),
    );
    expect(
      await within(sheet).findByRole("list", { name: "Hari belum dicocokkan" }),
    ).toBeInTheDocument();
  });
});
