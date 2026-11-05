import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "@/shared/lib/business-day";
import type { CreditEntry, MockCreditPayment, MockState, MockUser } from "./db";
import { appendCredit } from "./ledger";
import { KIND, makeId } from "./seed";

/** Buku kasbon awal per pelanggan: [hari lalu, jumlah]; negatif = pelunasan. */
const SEED_CUSTOMERS: [
  name: string,
  phone: string,
  limit: number,
  ledger: [daysAgo: number, amount: number][],
][] = [
  [
    "Bu Sari",
    "081234500001",
    500000,
    [
      [40, 80000],
      [18, 40000],
    ],
  ],
  [
    "Pak Joko",
    "081234500002",
    300000,
    [
      [12, 200000],
      [4, 90000],
    ],
  ],
  [
    "Mbak Dewi",
    "081234500003",
    500000,
    [
      [20, 75000],
      [6, -75000],
    ],
  ],
  ["Pak Udin", "081234500004", 200000, [[35, 50000]]],
  [
    "Bu Tini",
    "081234500005",
    1000000,
    [
      [70, 300000],
      [45, 500000],
      [38, -300000],
      [9, 140000],
    ],
  ],
];

type SeedLedger = Pick<
  MockState,
  "customers" | "creditLedger" | "creditPayments"
>;
type SeedKasir = Pick<MockUser, "id" | "name">;

/**
 * Pelunasan seed (pra-cek): rekaman Tunai jalur kasir tanpa shift (`shiftId` null — tidak dihitung
 * di `closedShifts`, penyederhanaan seed) beserta entri buku ber-`paymentId`.
 */
export function appendSeedRepayment(
  state: SeedLedger,
  kasir: SeedKasir,
  repayment: { customerId: string; amount: number; at: number },
): void {
  const { customerId, amount, at } = repayment;
  const id = makeId(KIND.payment, state.creditPayments.length + 1);
  appendCredit(state, {
    customerId,
    amount: -amount,
    at,
    saleId: null,
    paymentId: id,
  });
  state.creditPayments.push({
    id,
    customerId,
    amount,
    at,
    channel: "kasir",
    method: "tunai",
    createdById: kasir.id,
    createdByName: kasir.name,
    shiftId: null,
    cashReceived: amount,
    change: 0,
    balanceAfter:
      state.customers.find((c) => c.id === customerId)?.balance ?? 0,
    printStatus: "tidak_dicetak",
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelledChannel: null,
    cancelReason: null,
  });
}

/**
 * `balanceAfter` rekaman seed = saldo menurut urutan waktu buku (seed pelanggan dan riwayat
 * ditambahkan bergantian, jadi urutan tambah ≠ urutan waktu). Seri jam: urutan buku.
 */
export function settleSeedBalanceAfter(state: SeedLedger): void {
  const ordered = [...state.creditLedger].sort((a, b) => a.at - b.at);
  const running = new Map<string, number>();
  const after = new Map<string, number>();
  for (const e of ordered) {
    const balance = (running.get(e.customerId) ?? 0) + e.amount;
    running.set(e.customerId, balance);
    if (e.paymentId !== null && e.amount < 0) after.set(e.paymentId, balance);
  }
  for (const p of state.creditPayments) {
    p.balanceAfter = after.get(p.id) ?? p.balanceAfter;
  }
}

/** Pelanggan seed dengan saldo yang dibangun dari buku kasbon (relatif terhadap `now`). */
export function seedCustomers(
  now: number,
  kasir: SeedKasir,
): {
  customers: Customer[];
  creditLedger: CreditEntry[];
  creditPayments: MockCreditPayment[];
} {
  const customers = SEED_CUSTOMERS.map(
    ([name, phone, creditLimit], i): Customer => ({
      id: makeId(KIND.customer, i + 1),
      name,
      phone,
      creditLimit,
      balance: 0,
    }),
  );
  const entries = SEED_CUSTOMERS.flatMap(([, , , ledger], i) =>
    ledger.map(([daysAgo, amount]) => ({
      customerId: customers[i]?.id ?? "",
      amount,
      at: now - daysAgo * DAY_MS,
    })),
  ).sort((a, b) => a.at - b.at);
  const seeded: SeedLedger = {
    customers,
    creditLedger: [],
    creditPayments: [],
  };
  for (const { customerId, amount, at } of entries) {
    if (amount < 0) {
      appendSeedRepayment(seeded, kasir, { customerId, amount: -amount, at });
    } else {
      appendCredit(seeded, {
        customerId,
        amount,
        at,
        saleId: null,
        paymentId: null,
      });
    }
  }
  return seeded;
}
