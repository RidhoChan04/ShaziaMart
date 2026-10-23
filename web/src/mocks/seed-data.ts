import type {
  Product,
  ProductBaseUnit,
  ProductUnit,
  WholesaleTier,
} from "../shared/api/gen/shaziaMartAPI.schemas";
import { roundHalfUp } from "../shared/lib/quantity";
import type { MockState, MockUser } from "./db";
import { KIND, makeId, rng } from "./seed";
import { CATALOG_NAMES } from "./seed-catalog-names";
import { seedCustomers } from "./seed-customers";

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
  curah("Gula Pasir", "2001", "gram", "kg", 18000),
  curah("Beras", "2002", "gram", "kg", 14000),
  curah("Telur Ayam", "2003", "gram", "kg", 29000),
  curah("Minyak Goreng", "2004", "ml", "L", 17000),
  curah("Tepung Terigu", "2005", "gram", "kg", 13000),
];

const TOTAL_PRODUCTS = 60;

/** HPP tetap ("storeCode/satuan" -> Rp) untuk fixture yang dipakai test angka persis. */
const FIXED_COSTS: Record<string, number> = {
  "1001/pcs": 2650,
  "1001/dus": 104000,
  "1002/pcs": 71000,
  "2001/kg": 16500,
};

/** Stok minimum = 10 satuan jual pertama (curah: 10 kg = 10000 g). */
const MIN_STOCK_UNITS = 10;
const LOW_STOCK_PRODUCTS = 7;

const SEED_USERS: Omit<MockUser, "id">[] = [
  { name: "Rina", role: "kasir", pin: "123456" },
  { name: "Budi", role: "kasir", pin: "654321" },
  { name: "Pak Ahmad", role: "pemilik", pin: "999999", password: "pemilik123" },
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

/** 85–93% harga, dibulatkan ke Rp50. */
const costFromPrice = (price: number, rand: () => number): number =>
  roundHalfUp(price * (85 + Math.floor(rand() * 9)), 5000) * 50;

export function createSeedState(now: number = Date.now()): MockState {
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

  const unitCosts: Record<string, number> = {};
  const minStock: Record<string, number> = {};
  for (const p of products) {
    minStock[p.id] = MIN_STOCK_UNITS * (p.units[0]?.unitSize ?? 1);
    for (const u of p.units) {
      unitCosts[u.id] =
        FIXED_COSTS[`${p.storeCode}/${u.name}`] ?? costFromPrice(u.price, rand);
    }
  }
  // Barang buatan saja, agar fixture yang dipakai E2E tidak pernah menipis.
  const generated = products.slice(FIXTURES.length);
  for (const p of shuffle(generated, rand).slice(0, LOW_STOCK_PRODUCTS)) {
    const min = minStock[p.id] ?? MIN_STOCK_UNITS;
    stock[p.id] = 1 + Math.floor(rand() * (min - 1)); // 1 .. min − 1
  }

  const users: MockUser[] = SEED_USERS.map((u, i) => ({
    ...u,
    id: makeId(KIND.user, i + 1),
  }));
  return {
    version: 3,
    store: { id: makeId(KIND.store, 1), name: "ShaziaMart" },
    users,
    session: null,
    pinFailures: {},
    ownerSession: null,
    ownerLoginFailures: {},
    shift: null,
    closedShifts: [],
    products,
    stock,
    minStock,
    unitCosts,
    sales: [],
    ...seedCustomers(now),
    settings: {
      storeName: "ShaziaMart",
      autoPrint: true,
      curahFractions: [250, 500, 1000, 1500, 2000],
      quickCurahProductIds: products.filter((p) => p.isCurah).map((p) => p.id),
      qrisImageUrl: "/qris-contoh.svg",
      allowNegativeStock: true,
    },
    saleSeq: {},
  };
}
