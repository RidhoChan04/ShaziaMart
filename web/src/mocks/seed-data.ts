import type {
  Customer,
  Product,
  ProductBaseUnit,
  ProductUnit,
  WholesaleTier,
} from "../shared/api/gen/shaziaMartAPI.schemas";
import type { MockState, MockUser } from "./db";
import { rng } from "./seed";
import { CATALOG_NAMES } from "./seed-catalog-names";

/** Jenis ID: bagian waktu UUIDv7 tetap per jenis, jadi urut dan stabil antar-run. */
const KIND = { store: 0, user: 1, product: 2, unit: 3, customer: 4 } as const;

function makeId(kind: number, n: number): string {
  const ts = (0x01900000 + kind).toString(16).padStart(8, "0");
  return `${ts}-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

type UnitSpec = {
  name: string;
  unitSize: number;
  price: number;
  barcodes: string[];
  tiers?: WholesaleTier[];
};

type Fixture = {
  name: string;
  storeCode: string;
  baseUnit: ProductBaseUnit;
  isCurah: boolean;
  units: UnitSpec[];
};

const curah = (
  name: string,
  storeCode: string,
  baseUnit: ProductBaseUnit,
  unit: string,
  price: number,
): Fixture => ({
  name,
  storeCode,
  baseUnit,
  isCurah: true,
  units: [{ name: unit, unitSize: 1000, price, barcodes: [] }],
});

const pcs = (
  name: string,
  storeCode: string,
  price: number,
  barcode: string,
): Fixture => ({
  name,
  storeCode,
  baseUnit: "pcs",
  isCurah: false,
  units: [{ name: "pcs", unitSize: 1, price, barcodes: [barcode] }],
});

const FIXTURES: Fixture[] = [
  {
    name: "Indomie Goreng",
    storeCode: "1001",
    baseUnit: "pcs",
    isCurah: false,
    units: [
      {
        name: "pcs",
        unitSize: 1,
        price: 3100,
        barcodes: ["089686010947"],
        tiers: [{ minQty: 40, price: 2800 }],
      },
      { name: "dus", unitSize: 40, price: 112000, barcodes: ["189686010944"] },
    ],
  },
  pcs("Beras Pandan Wangi 5 kg", "1002", 78000, "8991002101012"),
  pcs("Minyak Goreng Bimoli 2 L", "1003", 36000, "8992696404441"),
  pcs("Kopi Kapal Api 165 g", "1004", 14500, "8991002105126"),
  curah("Gula Pasir (curah)", "2001", "gram", "kg", 18000),
  curah("Beras (curah)", "2002", "gram", "kg", 14000),
  curah("Telur Ayam (curah)", "2003", "gram", "kg", 29000),
  curah("Minyak Goreng (curah)", "2004", "ml", "L", 17000),
  curah("Tepung Terigu (curah)", "2005", "gram", "kg", 13000),
];

const TOTAL_PRODUCTS = 60;

const SEED_USERS: Omit<MockUser, "id">[] = [
  { name: "Rina", role: "kasir", pin: "123456" },
  { name: "Budi", role: "kasir", pin: "654321" },
  { name: "Pak Ahmad", role: "pemilik", pin: "999999" },
];

const SEED_CUSTOMERS: [
  name: string,
  phone: string,
  limit: number,
  balance: number,
][] = [
  ["Bu Sari", "081234500001", 500000, 120000],
  ["Pak Joko", "081234500002", 300000, 290000],
  ["Mbak Dewi", "081234500003", 500000, 0],
  ["Pak Udin", "081234500004", 200000, 50000],
  ["Bu Tini", "081234500005", 1000000, 640000],
];

/** Pengacakan Fisher-Yates deterministik. */
function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function buildProduct(
  fx: Fixture,
  index: number,
  unitSeq: { n: number },
): Product {
  const id = makeId(KIND.product, index + 1);
  const units: ProductUnit[] = fx.units.map((u) => {
    unitSeq.n += 1;
    return {
      id: makeId(KIND.unit, unitSeq.n),
      productId: id,
      name: u.name,
      unitSize: u.unitSize,
      price: u.price,
      wholesaleTiers: u.tiers ?? [],
      barcodes: u.barcodes,
    };
  });
  return {
    id,
    name: fx.name,
    storeCode: fx.storeCode,
    isCurah: fx.isCurah,
    baseUnit: fx.baseUnit,
    units,
  };
}

function generatedFixtures(rand: () => number, count: number): Fixture[] {
  let barcodeSeq = 0;
  // Counter mendominasi rentang acak (1000), sehingga barcode selalu unik.
  const barcode = () => {
    barcodeSeq += 1;
    const tail = barcodeSeq * 1000003 + Math.floor(rand() * 1000);
    return `899${String(tail).padStart(10, "0")}`;
  };
  return shuffle(CATALOG_NAMES, rand)
    .slice(0, count)
    .map((entry, i) => {
      // Barang berdus murah per bungkus (Rp2.000 .. Rp6.500); lainnya Rp1.000 .. Rp94.500.
      const price = entry.pack
        ? 2000 + Math.floor(rand() * 10) * 500
        : 1000 + Math.floor(rand() * 188) * 500;
      const units: UnitSpec[] = [
        { name: "pcs", unitSize: 1, price, barcodes: [barcode()] },
      ];
      if (entry.pack) {
        const [packName, size] = entry.pack;
        units.push({
          name: packName,
          unitSize: size,
          price: Math.round((price * size * 0.95) / 500) * 500,
          barcodes: [barcode()],
        });
      }
      return {
        name: entry.name,
        storeCode: String(1101 + i),
        baseUnit: "pcs",
        isCurah: false,
        units,
      };
    });
}

export function createSeedState(): MockState {
  const rand = rng();
  const fixtures = [
    ...FIXTURES,
    ...generatedFixtures(rand, TOTAL_PRODUCTS - FIXTURES.length),
  ];
  const unitSeq = { n: 0 };
  const products = fixtures.map((fx, i) => buildProduct(fx, i, unitSeq));

  const stock: Record<string, number> = {};
  for (const p of products) {
    const qty = 20 + Math.floor(rand() * 181); // 20 .. 200
    stock[p.id] = p.isCurah ? qty * 1000 : qty;
  }

  const users: MockUser[] = SEED_USERS.map((u, i) => ({
    ...u,
    id: makeId(KIND.user, i + 1),
  }));
  const customers: Customer[] = SEED_CUSTOMERS.map(
    ([name, phone, creditLimit, balance], i) => ({
      id: makeId(KIND.customer, i + 1),
      name,
      phone,
      creditLimit,
      balance,
    }),
  );

  return {
    version: 2,
    store: { id: makeId(KIND.store, 1), name: "ShaziaMart" },
    users,
    session: null,
    pinFailures: {},
    shift: null,
    closedShifts: [],
    products,
    stock,
    sales: [],
    customers,
    settings: {
      storeName: "ShaziaMart",
      autoPrint: true,
      curahFractions: [250, 500, 1000, 1500, 2000],
      quickCurahProductIds: products
        .filter((p) => p.storeCode >= "2001" && p.storeCode <= "2005")
        .map((p) => p.id),
      qrisImageUrl: "/qris-contoh.svg",
      allowNegativeStock: true,
    },
    saleSeq: {},
  };
}
