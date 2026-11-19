import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reviewSeedSamples } from "@/mocks/attention-fixtures";
import { type MockSale, mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { ownerTodaySummary } from "@/mocks/owner-summary";
import type {
  Attention,
  ExceptionAttention,
  ExceptionKind,
  OwnerTodaySummary,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

const wib = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 7, min);
/** Kamis 19 Nov 2026 10.00 WIB. */
const NOW = wib(2026, 11, 19, 10);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const ex = (
  kind: ExceptionKind,
  patch: Partial<ExceptionAttention>,
): ExceptionAttention => ({
  kind,
  count: 1,
  total: 0,
  shortage: 0,
  from: "2026-11-19",
  to: "2026-11-19",
  latestAt: 0,
  kasirId: null,
  kasirName: null,
  longestMinutes: null,
  ...patch,
});

/** Sembilan butir seperti mockup: enam kejadian, Stok minus, QRIS, Stok menipis. */
function nine(): Attention {
  const base = ownerTodaySummary(mockDb.get(), NOW).attention;
  return {
    ...base,
    lowStockCount: 7,
    negativeStockCount: 3,
    overdueCredit: { count: 0, total: 0 },
    costChanges: [],
    stockOuts: [],
    awaitingPriceCount: 0,
    opnameHeldCount: 0,
    opnameFlags: [],
    opnameReplacedHeld: 0,
    expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
    supplierDebts: {
      overdueCount: 0,
      overdueTotal: 0,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    },
    qrisUnreconciled: { count: 3, from: "2026-11-16", to: "2026-11-18" },
    exceptions: [
      ex("batal_kas_keluar", { total: 35_000, latestAt: 101 }),
      ex("selisih_kas", {
        count: 2,
        total: -6_000,
        shortage: -12_000,
        from: "2026-11-16",
        to: "2026-11-18",
        latestAt: 102,
      }),
      ex("kas_keluar", {
        count: 2,
        total: 157_000,
        from: "2026-11-18",
        to: "2026-11-18",
        latestAt: 103,
      }),
      ex("serah_terima", { total: -20_000, latestAt: 104 }),
      ex("shift_lama", {
        from: "2026-11-17",
        to: "2026-11-17",
        longestMinutes: 13 * 60 + 5,
        latestAt: 105,
      }),
      ex("selisih_kecil", {
        count: 5,
        total: -21_500,
        shortage: -21_500,
        from: "2026-11-13",
        to: "2026-11-17",
        kasirId: "u-budi",
        kasirName: "Budi",
        latestAt: 106,
      }),
    ],
  };
}

/** Ringkasan buatan dengan penanda tinjau tiruan: meninjau butir menghapusnya dari respons berikutnya. */
function serve(attention: Attention) {
  const reviews: unknown[] = [];
  let current = attention;
  const summary = (): OwnerTodaySummary => ({
    ...ownerTodaySummary(mockDb.get(), NOW),
    attention: current,
  });
  server.use(
    http.get("/api/owner/summary/today", () => HttpResponse.json(summary())),
    http.post("/api/owner/exceptions/review", async ({ request }) => {
      const body = (await request.json()) as {
        kind: ExceptionKind;
        kasirId?: string | null;
        upTo: number;
      };
      reviews.push(body);
      current = {
        ...current,
        exceptions: current.exceptions.filter(
          (e) =>
            !(
              e.kind === body.kind &&
              (body.kind !== "selisih_kecil" || e.kasirId === body.kasirId)
            ),
        ),
      };
      return HttpResponse.json({
        kind: body.kind,
        reviewedAt: body.upTo,
        items: [],
      });
    }),
  );
  return { reviews };
}

const rowTexts = () =>
  within(screen.getByRole("main"))
    .getAllByRole("listitem")
    .map((li) => {
      const link = within(li).queryByRole("link");
      return link?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    });

describe("halaman Lihat semua", () => {
  test("memuat semua butir dengan urutan sama dengan Beranda; eyebrow jumlah butir", async () => {
    await ownerLogin();
    serve(nine());
    renderApp("/owner/perhatian");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Perlu perhatian" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("9 butir")).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: /Beranda/ }),
    ).toHaveAttribute("href", "/owner");
    expect(rowTexts()).toEqual([
      "1 kas keluar dibatalkan kasir 19 Nov · Rp35.000",
      "2 selisih kas 16–18 Nov · −Rp12.000 · +Rp6.000",
      "2 kas keluar besar 18 Nov · Rp157.000",
      "1 modal awal berbeda 19 Nov · −Rp20.000",
      "1 shift kelamaan buka 17 Nov · terlama 13 jam",
      "Selisih kecil berulang · Budi 13–17 Nov · 5 shift · −Rp21.500",
      "Stok minus 3 barang",
      "QRIS belum dicocokkan: 3 hari 16–18 Nov",
      "Stok menipis 7 barang",
    ]);
  });

  test("tombol Tandai sudah ditinjau hanya di butir kejadian; baris keadaan tanpa tombol; QRIS punya Cocokkan", async () => {
    await ownerLogin();
    serve(nine());
    renderApp("/owner/perhatian");
    await screen.findByText("9 butir");

    expect(
      screen.getAllByRole("button", { name: /^Tandai sudah ditinjau: / }),
    ).toHaveLength(6);
    const rows = within(screen.getByRole("main")).getAllByRole("listitem");
    const rowOf = (title: string) => {
      const row = rows.find((li) => li.textContent?.includes(title));
      if (!row) throw new Error(title);
      return within(row);
    };
    expect(rowOf("Stok minus").queryByRole("button")).toBeNull();
    expect(rowOf("Stok menipis").queryByRole("button")).toBeNull();
    const qris = rowOf("QRIS belum dicocokkan");
    expect(qris.getByRole("button", { name: "Cocokkan" })).toBeInTheDocument();
    expect(qris.queryByRole("button", { name: /ditinjau/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /semua/i })).toBeNull();
  });

  test("Tandai sudah ditinjau mengirim {kind, kasirId, upTo}; butir hilang, jumlah turun, pesan tampil", async () => {
    const user = userEvent.setup();
    await ownerLogin();
    const { reviews } = serve(nine());
    renderApp("/owner/perhatian");
    await screen.findByText("9 butir");

    await user.click(
      screen.getByRole("button", {
        name: "Tandai sudah ditinjau: 2 selisih kas",
      }),
    );
    await screen.findByText("8 butir");
    expect(reviews).toEqual([
      { kind: "selisih_kas", kasirId: null, upTo: 102 },
    ]);
    expect(screen.queryByText("2 selisih kas")).toBeNull();
    expect(
      await screen.findByText("Ditandai sudah ditinjau"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Perlu perhatian" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", {
        name: "Tandai sudah ditinjau: Selisih kecil berulang · Budi",
      }),
    );
    await screen.findByText("7 butir");
    expect(reviews[1]).toEqual({
      kind: "selisih_kecil",
      kasirId: "u-budi",
      upTo: 106,
    });
  });

  test("tanpa butir: Semua aman hari ini", async () => {
    await ownerLogin();
    serve({
      ...nine(),
      exceptions: [],
      negativeStockCount: 0,
      lowStockCount: 0,
      qrisUnreconciled: null,
    });
    renderApp("/owner/perhatian");
    expect(await screen.findByText("Semua aman hari ini")).toBeInTheDocument();
    expect(screen.queryByText(/butir$/)).toBeNull();
  });

  test("gagal memuat: pesan galat dan Coba lagi", async () => {
    await ownerLogin();
    server.use(
      http.get("/api/owner/summary/today", () =>
        HttpResponse.json({ code: "X", message: "x" }, { status: 500 }),
      ),
    );
    renderApp("/owner/perhatian");
    expect(
      await screen.findByRole("button", { name: "Coba lagi" }),
    ).toBeInTheDocument();
  });
});

let n = 0;
const qrisSale = (at: number, qris: number): MockSale => {
  n += 1;
  return {
    id: `qa-${n}`,
    number: `2026112${n}`,
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
  };
};

describe("halaman Lihat semua: QRIS (S11)", () => {
  test("Cocokkan membuka lembar di halaman yang sama; satu hari Cocok menurunkan jumlah; fokus kembali", async () => {
    const user = userEvent.setup();
    await ownerLogin();
    mockDb.update((s) => {
      reviewSeedSamples(s, NOW);
      s.qrisSince = "2026-11-16";
      s.creditPayments = [];
      s.qrisDays = {};
      s.sales = [
        qrisSale(wib(2026, 11, 16, 9), 853_000),
        qrisSale(wib(2026, 11, 17, 9), 775_500),
        qrisSale(wib(2026, 11, 18, 9), 742_000),
      ];
    });
    renderApp("/owner/perhatian");
    const row = (
      await screen.findByText("QRIS belum dicocokkan: 3 hari")
    ).closest("li");
    if (!row) throw new Error("tanpa baris");
    const trigger = within(row).getByRole("button", { name: "Cocokkan" });
    await user.click(trigger);

    const sheet = await screen.findByRole("dialog", { name: "Cocokkan QRIS" });
    expect(within(sheet).queryByRole("button", { name: /semua/i })).toBeNull();
    await user.click(
      await within(sheet).findByRole("button", { name: "Cocok Sen, 16 Nov" }),
    );
    expect(
      await screen.findByText("QRIS belum dicocokkan: 2 hari"),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Tutup" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cocokkan QRIS" }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cocokkan" })).toHaveFocus(),
    );
    await act(async () => {});
  });
});
