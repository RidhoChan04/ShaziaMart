import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  MockClosedShift,
  MockDrawerExpense,
  MockShift,
  MockState,
} from "@/mocks/db";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  CashierException,
  ExceptionKind,
  OwnerExceptionList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
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

function openShift(
  s: MockState,
  name: string,
  over: Partial<MockShift> = {},
): MockShift {
  const u = userOf(s, name);
  const shift: MockShift = {
    id: "sh-t9b-buka",
    kasirId: u.id,
    kasirName: u.name,
    openedAt: EXC_NOW - 13 * HOUR,
    openingCash: 200_000,
    suggestedOpening: null,
    openingNote: null,
    cashSales: 0,
    salesCount: 0,
    cashOuts: [],
    creditCash: [],
    saleRefunds: [],
    ...over,
  };
  s.shift = shift;
  return shift;
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

test("selisih kas: judul, baris '{kasir}' ±Rp, 'Shift {buka}–{tutup}' tanpa alasan, ketuk membuka rincian shift; jam shift dari kejadian (tanpa memuat shift per baris)", async () => {
  const shiftFetches: string[] = [];
  const onRequest = ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname.startsWith("/api/owner/shifts/")) {
      shiftFetches.push(request.url);
    }
  };
  server.events.on("request:start", onRequest);
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
  server.events.removeListener("request:start", onRequest);
  expect(shiftFetches).toEqual([]);
});

test("shift masih buka: 'Shift sejak {HH.MM}' (§12g), bukan rentang", async () => {
  mockDb.update((s) => {
    openShift(s, "Rina");
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/shift_lama");
  const r = within(rowFor(await screen.findByText("13 jam")));
  expect(r.getByText("Shift sejak 01.00")).toBeInTheDocument();
  expect(r.getByRole("link")).toHaveAttribute(
    "href",
    "/owner/lainnya/shift/sh-t9b-buka",
  );
});

test("kas keluar per shift di shift yang masih buka: 'Total kas keluar shift sejak {HH.MM}'", async () => {
  mockDb.update((s) => {
    const sh = openShift(s, "Rina", { openedAt: EXC_NOW - 5 * HOUR });
    for (const [i, amount] of [50_000, 50_000, 50_000, 10_000].entries()) {
      expense(s, sh.id, EXC_NOW - (4 - i) * HOUR, amount, `Belanja ${i}`);
    }
  });
  await ownerLogin();
  renderApp("/owner/pengecualian/kas_keluar");
  const r = within(
    rowFor(await screen.findByText("Total kas keluar shift sejak 09.00")),
  );
  expect(r.getByText("Rp160.000")).toBeInTheDocument();
});

test("kejadian tanpa shiftId: baris bukan tautan dan tanpa ›", async () => {
  const row: CashierException = {
    id: "kk-tanpa-shift",
    kind: "batal_kas_keluar",
    at: EXC_NOW - HOUR,
    kasirId: null,
    kasirName: "Rina",
    amount: 35_000,
    reason: "Salah catat",
    customerName: null,
    saleId: null,
    saleNumber: null,
    paymentId: null,
    shiftId: null,
    shiftOpenedAt: null,
    shiftClosedAt: null,
    durationMinutes: null,
    fromClosedShift: false,
    refund: 0,
    qrisToOwner: 0,
    overLimitExcess: null,
  };
  const list: OwnerExceptionList = {
    kind: "batal_kas_keluar",
    reviewedAt: null,
    items: [row],
  };
  server.use(http.get("/api/owner/exceptions", () => HttpResponse.json(list)));
  await ownerLogin();
  renderApp("/owner/pengecualian/batal_kas_keluar");
  const li = rowFor(await screen.findByText("Salah catat"));
  expect(within(li).getByText("Rina")).toBeInTheDocument();
  expect(within(li).queryByRole("link")).toBeNull();
  expect(li.querySelector("svg")).toBeNull();
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
      name: "Modal awal berbeda",
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
  // Σ 7.000 di bawah batas: tidak ada butir server → kartu tanpa total dan jumlah shift.
  expect(screen.getByText("Kurang dalam 7 hari · Budi")).toBeInTheDocument();
  expect(await screen.findByText("batas Rp20.000")).toBeInTheDocument();
  expect(screen.queryByText(/ shift · batas /)).toBeNull();
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

test("selisih kecil: kartu 'Kurang dalam 7 hari · {kasir}' / total butir server / '{n} shift · batas {Rp}'", async () => {
  let budiId = "";
  mockDb.update((s) => {
    budiId = userOf(s, "Budi").id;
    for (let i = 0; i < 6; i++) {
      const closedAt = EXC_NOW - i * 24 * HOUR - HOUR;
      closed(s, "Budi", {
        openedAt: closedAt - 6 * HOUR,
        closedAt,
        difference: -4_000,
      });
    }
  });
  await ownerLogin();
  renderApp(`/owner/pengecualian/selisih_kecil?kasirId=${budiId}`);
  expect(
    await screen.findByText("Kurang dalam 7 hari · Budi"),
  ).toBeInTheDocument();
  expect(await screen.findByText("Rp24.000")).toBeInTheDocument();
  expect(
    await screen.findByText("6 shift · batas Rp20.000"),
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
