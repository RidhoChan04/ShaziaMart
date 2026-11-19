import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MockClosedShift, MockDrawerExpense, MockState } from "@/mocks/db";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import type { ExceptionKind } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";
import { EXC_NOW } from "@/test/seed-exceptions";

const HOUR = 3_600_000;
const MIN = 60_000;
// 5 Nov 2026 14.00 WIB: shift 07.00–13.30 ditutup 13.30 (Rp12.000 kurang), dst.
let seq = 0;

function userOf(s: MockState, name: string) {
  const u = s.users.find((x) => x.name === name);
  if (!u) throw new Error(`seed tanpa ${name}`);
  return u;
}

function closed(
  s: MockState,
  name: string,
  over: Partial<MockClosedShift> = {},
): MockClosedShift {
  seq += 1;
  const u = userOf(s, name);
  const c: MockClosedShift = {
    shiftId: `sh-t9b-${seq}`,
    kasirId: u.id,
    kasirName: u.name,
    openedAt: EXC_NOW - 7 * HOUR,
    closedAt: EXC_NOW - 30 * MIN,
    openingCash: 200_000,
    suggestedOpening: null,
    openingNote: null,
    cashSales: 0,
    supplierPayments: 0,
    creditPayments: 0,
    saleRefunds: 0,
    expenses: 0,
    ownerTakes: 0,
    expectedCash: 200_000,
    countedCash: 200_000,
    difference: 0,
    salesCount: 0,
    ...over,
  };
  s.closedShifts.push(c);
  return c;
}

function expense(
  s: MockState,
  shiftId: string,
  at: number,
  amount: number,
  reason: string,
  over: Partial<MockDrawerExpense> = {},
) {
  seq += 1;
  const u = userOf(s, "Rina");
  s.drawerExpenses.push({
    id: `kk-t9b-${seq}`,
    at,
    amount,
    reason,
    shiftId,
    createdById: u.id,
    createdByName: u.name,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelledChannel: null,
    cancelReason: null,
    ...over,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EXC_NOW);
  mockDb.update((s) => {
    s.closedShifts = [];
    s.drawerExpenses = [];
    s.cashTakes = [];
    s.shift = null;
    for (const k of Object.keys(s.exceptionReviews) as ExceptionKind[]) {
      s.exceptionReviews[k] = null;
    }
    s.smallShortageReviews = {};
  });
});

afterEach(() => vi.useRealTimers());

test("selisih kas: judul, baris '{kasir}' ±Rp, 'Shift {buka}–{tutup}' tanpa alasan, ketuk membuka rincian shift", async () => {
  let shiftId = "";
  mockDb.update((s) => {
    const c = closed(s, "Rina", { difference: -12_000 });
    shiftId = c.shiftId;
    closed(s, "Budi", {
      openedAt: EXC_NOW - 6 * HOUR,
      closedAt: EXC_NOW - 10 * MIN,
      difference: 6_000,
    });
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/selisih_kas");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Selisih kas" }),
  ).toBeInTheDocument();
  const rina = await screen.findByText("−Rp12.000");
  const row = within(rina.closest("li") as HTMLElement);
  expect(row.getByText("Rina")).toBeInTheDocument();
  expect(await row.findByText("Shift 07.00–13.30")).toBeInTheDocument();
  expect(row.getByText("Hari ini 13.30")).toBeInTheDocument();
  expect(row.getByRole("link")).toHaveAttribute(
    "href",
    `/owner/lainnya/shift/${shiftId}`,
  );
  expect(screen.getByText("+Rp6.000")).toBeInTheDocument();
});

test("kas keluar besar: kas keluar tunggal pakai alasan; kejadian per shift 'Total kas keluar shift …' kanan Σ", async () => {
  mockDb.update((s) => {
    const c = closed(s, "Rina");
    expense(s, c.shiftId, EXC_NOW - 2 * HOUR, 85_000, "Bayar servis freezer");
    expense(s, c.shiftId, EXC_NOW - 1 * HOUR, 40_000, "Beli galon");
    expense(s, c.shiftId, EXC_NOW - 50 * MIN, 40_000, "Beli plastik");
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/kas_keluar");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Kas keluar besar" }),
  ).toBeInTheDocument();
  const single = within(
    rowFor(await screen.findByText("Bayar servis freezer")),
  );
  expect(single.getByText("Rina")).toBeInTheDocument();
  expect(single.getByText("Rp85.000")).toBeInTheDocument();
  const total = within(
    (await screen.findByText(/^Total kas keluar shift 07\.00–13\.30$/)).closest(
      "li",
    ) as HTMLElement,
  );
  expect(total.getByText("Rp165.000")).toBeInTheDocument();
  expect(total.getByRole("link")).toBeInTheDocument();
});

test("serah terima: alasan modal berbeda di baris, selisih bertanda kanan", async () => {
  mockDb.update((s) => {
    closed(s, "Budi", {
      openedAt: EXC_NOW - 3 * HOUR,
      closedAt: EXC_NOW - HOUR,
      openingCash: 180_000,
      suggestedOpening: 200_000,
      openingNote: "Uang dipakai beli es",
    });
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/serah_terima");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Modal berbeda saat serah terima",
    }),
  ).toBeInTheDocument();
  const r = within(
    await screen.findByText("Uang dipakai beli es").then(rowFor),
  );
  expect(r.getByText("−Rp20.000")).toBeInTheDocument();
  expect(r.getByText("Budi")).toBeInTheDocument();
});

const rowFor = (el: HTMLElement) => el.closest("li") as HTMLElement;

test("shift kelamaan: kanan '{j} jam', kiri 'Shift {buka}–{tutup}'", async () => {
  mockDb.update((s) => {
    closed(s, "Rina", {
      openedAt: EXC_NOW - 30 * HOUR,
      closedAt: EXC_NOW - 17 * HOUR,
    });
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/shift_lama");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Shift kelamaan buka",
    }),
  ).toBeInTheDocument();
  const r = within(rowFor(await screen.findByText("13 jam")));
  expect(r.getByText("Rina")).toBeInTheDocument();
  expect(
    await r.findByText(/^Shift \d\d\.\d\d–\d\d\.\d\d$/),
  ).toBeInTheDocument();
});

test("kas keluar dibatalkan kasir: baris '{kasir}' / '{alasan batal}' kanan nominal", async () => {
  mockDb.update((s) => {
    const c = closed(s, "Rina");
    const u = userOf(s, "Rina");
    expense(s, c.shiftId, EXC_NOW - 3 * HOUR, 35_000, "Beli galon", {
      cancelledAt: EXC_NOW - HOUR,
      cancelledById: u.id,
      cancelledByName: u.name,
      cancelledChannel: "kasir",
      cancelReason: "Salah catat",
    });
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/batal_kas_keluar");
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Kas keluar dibatalkan kasir",
    }),
  ).toBeInTheDocument();
  const r = within(rowFor(await screen.findByText("Salah catat")));
  expect(r.getByText("Rina")).toBeInTheDocument();
  expect(r.getByText("Rp35.000")).toBeInTheDocument();
});

test("selisih kecil: hanya kasir dari kasirId; 'Tandai sudah ditinjau' mengirim kasirId dan upTo = at terbaru", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  let rinaId = "";
  let budiId = "";
  mockDb.update((s) => {
    rinaId = userOf(s, "Rina").id;
    budiId = userOf(s, "Budi").id;
    closed(s, "Budi", { difference: -4_000, closedAt: EXC_NOW - 2 * HOUR });
    closed(s, "Budi", {
      difference: -3_000,
      openedAt: EXC_NOW - 20 * HOUR,
      closedAt: EXC_NOW - 5 * HOUR,
    });
    closed(s, "Rina", { difference: -2_000, closedAt: EXC_NOW - HOUR });
  });
  await ownerLogin();
  renderApp(`/owner/pengecualian/selisih_kecil?kasirId=${budiId}`);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Selisih kecil berulang",
    }),
  ).toBeInTheDocument();
  expect(await screen.findByText("−Rp4.000")).toBeInTheDocument();
  expect(screen.getByText("−Rp3.000")).toBeInTheDocument();
  expect(screen.queryByText("−Rp2.000")).toBeNull();
  expect(screen.queryByText("Rina")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Tandai sudah ditinjau" }),
  );
  await waitFor(() =>
    expect(mockDb.get().smallShortageReviews[budiId]).toBe(EXC_NOW - 2 * HOUR),
  );
  expect(mockDb.get().smallShortageReviews[rinaId] ?? null).toBeNull();
  expect(
    await screen.findByText("Tidak ada yang perlu ditinjau"),
  ).toBeInTheDocument();
});

test("selisih kecil tanpa kasirId: kembali ke Beranda", async () => {
  await ownerLogin();
  const { router } = renderApp("/owner/pengecualian/selisih_kecil");
  await waitFor(() => expect(router.state.location.pathname).toBe("/owner"));
  expect(
    screen.queryByRole("heading", { name: "Selisih kecil berulang" }),
  ).toBeNull();
});
