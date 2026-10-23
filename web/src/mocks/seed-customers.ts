import type { Customer } from "../shared/api/gen/shaziaMartAPI.schemas";
import type { CreditEntry } from "./db";
import { appendCredit } from "./ledger";
import { KIND, makeId } from "./seed";

const DAY_MS = 86_400_000;

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

/** Pelanggan seed dengan saldo yang dibangun dari buku kasbon (relatif terhadap `now`). */
export function seedCustomers(now: number): {
  customers: Customer[];
  creditLedger: CreditEntry[];
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
  const creditLedger: CreditEntry[] = [];
  const entries = SEED_CUSTOMERS.flatMap(([, , , ledger], i) =>
    ledger.map(([daysAgo, amount]) => ({
      customerId: customers[i]?.id ?? "",
      amount,
      at: now - daysAgo * DAY_MS,
      saleId: null,
    })),
  ).sort((a, b) => a.at - b.at);
  const seeded = { customers, creditLedger };
  for (const entry of entries) appendCredit(seeded, entry);
  return seeded;
}
