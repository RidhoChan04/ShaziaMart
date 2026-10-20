# Rencana F2 — Layar Kasir: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layar kasir yang bisa dipakai jualan penuh di atas backend palsu: buka/tutup shift, kunci layar, scan/cari barang, barang curah (berat/nominal), keranjang bertabel, tahan transaksi, bayar tunai/QRIS/kasbon/campuran dengan kembalian, harga berubah (409), riwayat hari ini dengan cetak ulang dan batal (PIN pemilik).

**Architecture:** Kontrak `api/openapi.yaml` diperluas dengan endpoint kasir; UI hanya memakai hook orval. Backend palsu (MSW) menjadi stateful (state v2: barang, stok, shift, sesi, penjualan, pelanggan) dan menjalankan aturan bisnis yang sama dengan spec memakai `shared/lib/pricing.ts` yang juga dipakai UI untuk pratinjau. Keranjang ada di Zustand (persist localStorage); server tetap otoritatif atas total.

**Tech Stack:** (dari F1) React 19, TS strict, Vite, TanStack Router/Query, orval + zod, MSW 2, Tailwind 4 + shadcn, Vitest + Testing Library, Playwright + axe. Baru: `zustand`, `tw-animate-css`.

**Spec:** `docs/specs/2026-10-17-frontend-design.html` (bagian 4–7, 9, 11) + aturan data `docs/specs/2026-10-17-arsitektur-kasir-design.html` (bagian 5–7). PRD fitur K-01…K-14.

## Global Constraints

- Semua constraint F1 tetap berlaku (lihat `docs/plans/2026-10-17-F1-fondasi-frontend.md` → Global Constraints): TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; token warna saja (`--color-*: initial`); tanpa aset internet; uang `Number.isSafeInteger`; `round_half_up`; teks UI Bahasa Indonesia; OpenAPI `3.0.3`; problem+json dengan enum `ErrorCode`; MSW hanya bila `DEV`/`VITE_MOCK=1`; kode generate di-commit; commit tanpa tanda AI.
- Ikuti `docs/conventions.md` (struktur, penamaan, tanpa kode mati, interaksi, performa). Pemeriksaan wajib hijau: `lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check`, `e2e`.
- **Tanpa tombol F.** Pintasan hanya `Enter`, `Esc`, `↑`, `↓`, `Delete`. Semua aksi lain lewat tombol yang diklik (tinggi ≥ 44px).
- **Kursor kembali ke kolom scan** setelah setiap aksi yang menutup jendela atau menambah/mengubah keranjang.
- Jumlah barang disimpan sebagai `qtyBase` (`int`, satuan dasar: pcs / gram / ml); subtotal = `round_half_up(harga × qtyBase ÷ unitSize)`; curah per nominal: subtotal = nominal persis, `qtyBase = round_half_up(nominal × unitSize ÷ harga)`.
- Setiap item penjualan mengirim tepat salah satu dari `qtyBase` atau `amount`; `amount` hanya untuk satuan curah.
- Server (palsu maupun Go nanti) otoritatif atas harga & total; UI mengirim `expectedUnitPrice` per item.
- Waktu disimpan UTC ms; tanggal bisnis & nomor struk memakai zona `Asia/Jakarta`.
- Teks UI tetap (pakai persis):

| Kunci | Teks |
|---|---|
| kolom scan | `Scan barcode / ketik nama atau kode…` |
| tidak ditemukan | `Barang tidak ditemukan` |
| tombol bayar | `Bayar` |
| tombol tahan | `Tahan transaksi` |
| cetak struk | `Cetak struk` |
| total panel | `{n} BARANG · TOTAL` |
| tab bayar | `Tunai` · `QRIS` · `Kasbon` · `Campuran` |
| uang diterima | `UANG DITERIMA` |
| uang pas | `Uang pas` |
| kembalian | `KEMBALIAN` |
| kurang | `KURANG {Rp…}` |
| selesai | `Selesai` |
| QRIS konfirmasi | `Sudah masuk` |
| curah mode | `Berat (kg)` / `Berat (L)` · `Nominal (Rp)` |
| curah aksi | `Masukkan` · label harga `HARGA` |
| buka shift | judul `Buka shift`, tombol `Buka shift`, label `Modal awal di laci` |
| kunci | tombol `Kunci`, judul layar `Layar terkunci`, label `PIN` |
| tutup shift | tombol `Tutup shift`, label `Uang fisik di laci`, hasil `Uang seharusnya` · `Uang fisik` · `Selisih` |
| riwayat | tombol `Riwayat`, aksi `Cetak ulang` · `Batalkan` |
| PIN pemilik | judul `PIN pemilik`, label `Alasan` |
| harga berubah | judul `Harga berubah`, tombol `Konfirmasi & simpan` |
| struk gagal | `Struk gagal dicetak — cetak ulang dari Riwayat` |
| ditahan | tombol `Ditahan ({n})`, aksi `Lanjutkan` |

## Review Focus

1. **Bayar diklik dua kali / request diulang setelah jaringan putus** → hanya satu penjualan tersimpan (`saleId` sama). Dites di Task 6 (idempotensi server) dan Task 11 (tombol nonaktif saat pending + retry memakai `saleId` sama).
2. **Scanner menembak saat jendela terbuka** (bayar, curah, PIN) → hasil scan diabaikan, keranjang tidak berubah. Dites di Task 8.
3. **Halaman di-refresh / listrik padam di tengah transaksi** → keranjang + `saleId` pulih; setelah transaksi selesai, refresh tidak memunculkan keranjang lama. Dites di Task 7.
4. **Uang diterima diketik aneh** (`"400.000"`, `"400000"`, kosong, `"abc"`, kurang dari total) → dibaca benar, atau Selesai nonaktif dengan `KURANG Rp…`. Dites di Task 11.
5. **Server mati saat menekan Selesai** → keranjang tetap, pesan `Server tidak tersambung — coba lagi`, jendela bayar tetap terbuka, coba lagi aman. Dites di Task 11.

---

### Task 1: Rapikan sisa F1 (bentuk respons API, hook health, mockDb, animasi, helper problem)

**Files:**
- Modify: `web/orval.config.ts`, `web/src/shared/api/fetcher.ts`, `web/src/shared/api/fetcher.test.ts`, `web/src/shared/api/gen/**` (regenerate)
- Create: `web/src/shared/hooks/use-server-health.ts` (pindahan `useServerHealth`, `useRecheckServer`, `HEALTH_POLL_MS`, type `ServerHealth`)
- Modify: `web/src/shared/components/server-status.tsx` (hanya komponen), semua import yang memakai hook
- Modify: `web/src/mocks/db.ts`, `web/src/mocks/db.test.ts`
- Modify: `web/src/app/styles.css` (import `tw-animate-css`)
- Create: `web/src/shared/api/problem.ts`, Test: `web/src/shared/api/problem.test.ts`

**Interfaces:**
- Produces:
  - Hook orval mengembalikan **body** langsung (`override.fetch.includeHttpResponseReturnType: false`); `customFetch<T>` mengembalikan body hasil parse (204 → `undefined`); error tetap `ApiError` (`status`, `code`, `detail?`, `body?`).
  - `useServerHealth(): ServerHealth` di `@/shared/hooks/use-server-health` — `online` = query sukses **dan** `data.status === "ok"`.
  - `mockDb.get(): Readonly<MockState>` mengembalikan salinan (`structuredClone`); `mockDb.update(fn)` menjalankan `fn` pada salinan lalu menyimpan & mengganti cache.
  - `readProblem<T>(error: unknown, schema: z.ZodType<T>): T | null` — `error instanceof ApiError` dan `schema.safeParse(error.body)` sukses → data; selain itu `null`.
  - `Button` mendapat umpan balik tekan: `active:scale-[0.97] transition-transform duration-100 motion-reduce:transition-none motion-reduce:active:scale-100`.
  - `zod` dihapus dari `ignoreDependencies` di `web/knip.jsonc` (kini dipakai langsung oleh `problem.ts`).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// fetcher.test.ts — ganti test envelope F1
test("200 mengembalikan body langsung", async () => { mockFetch(200, { ok: true }, "application/json"); await expect(customFetch("/api/x", {})).resolves.toEqual({ ok: true }); });
test("204 mengembalikan undefined", async () => { mockFetch(204, null, ""); await expect(customFetch("/api/x", {})).resolves.toBeUndefined(); });
// problem.test.ts
test("readProblem membaca body ApiError yang cocok skema", () => {
  const err = new ApiError({ status: 409, code: "PRICE_CHANGED", body: { type: "about:blank", title: "Conflict", status: 409, code: "PRICE_CHANGED", changes: [{ unitId: "u1", oldUnitPrice: 3100, newUnitPrice: 3600 }] } });
  expect(readProblem(err, priceChangedProblemSchema)?.changes[0]?.newUnitPrice).toBe(3600);
});
test("readProblem → null untuk error lain / body tak cocok", () => { expect(readProblem(new Error("x"), priceChangedProblemSchema)).toBeNull(); });
// db.test.ts
test("mockDb.get mengembalikan salinan — mutasi tidak bocor", () => { const s = mockDb.get() as MockState; s.store.name = "X"; expect(mockDb.get().store.name).toBe("ShaziaMart"); });
// button.test.tsx
test("Button memberi umpan balik saat ditekan", () => { render(<Button>Bayar</Button>); expect(screen.getByRole("button").className).toContain("active:scale-[0.97]"); });
```
(`priceChangedProblemSchema` dibuat di Task 2; di task ini pakai skema zod lokal di test.) Test health lama yang memakai envelope disesuaikan ke bentuk body.

- [ ] **Step 2: Jalankan, pastikan gagal** — `npx vitest run src/shared src/mocks` → FAIL.
- [ ] **Step 3: Implementasi** — `npm i tw-animate-css` lalu `@import "tw-animate-css";` di `styles.css`; konfigurasi orval; `npm run gen`; pindahkan hook; `readProblem`.
- [ ] **Step 4: Verifikasi** — `npm run gen:check && npm test && npm run lint && npm run typecheck && npm run knip && npm run e2e` → semua hijau (E2E F1 tetap lolos).
- [ ] **Step 5: Commit** — `refactor(web): respons API berupa body, hook health di shared/hooks, salinan mockDb`

---

### Task 2: Kontrak API kasir

**Files:**
- Modify: `api/openapi.yaml`; regenerate `web/src/shared/api/gen/**`
- Modify: `web/src/shared/api/problem.ts` (skema zod `priceChangedProblemSchema`, `creditLimitProblemSchema`)
- Test: `web/src/shared/api/contract.test.ts`

**Interfaces:**
- Produces (skema komponen; semua uang/qty `integer`, waktu `integer` ms):
  - `WholesaleTier {minQty, price}`; `ProductUnit {id, productId, name, unitSize, price, wholesaleTiers: WholesaleTier[], barcodes: string[]}`; `Product {id, name, storeCode, isCurah, baseUnit: "pcs"|"gram"|"ml", units: ProductUnit[]}`; `CatalogMatch {product: Product, unitId}`.
  - `KasirSettings {storeName, autoPrint: boolean, curahFractions: integer[] (qtyBase), quickCurahProductIds: string[], qrisImageUrl, allowNegativeStock: boolean}`.
  - `User {id, name, role: "kasir"|"pemilik"}`; `Session {user: User}`.
  - `Shift {id, kasirId, kasirName, openedAt, openingCash}`; `CurrentShift {shift: Shift | null (nullable)}`; `ShiftClosure {shiftId, openingCash, cashSales, expectedCash, countedCash, difference, salesCount}`.
  - `SaleItemInput {unitId, qtyBase?, amount?, expectedUnitPrice}`; `PaymentInput {method: "cash"|"qris"|"credit", amount}`; `SaleRequest {saleId, items: SaleItemInput[] (minItems 1), payments: PaymentInput[] (minItems 1), cashReceived?, customerId?, print: boolean, ownerPin?}`.
  - `SaleItem {unitId, productName, unitName, isCurah, baseUnit, unitSize, qtyBase, unitPrice, subtotal, wholesale: boolean}`; `Sale {id, number, createdAt, kasirName, items: SaleItem[], total, payments: PaymentInput[], cashReceived, change, customerId (nullable), status: "selesai"|"dibatalkan", printStatus: "tercetak"|"tidak_dicetak"|"gagal"}`; `PrintResult {printStatus}`; `VoidRequest {ownerPin, reason}`.
  - `PriceChange {unitId, oldUnitPrice, newUnitPrice}`; `PriceChangedProblem = Problem + {changes: PriceChange[]}`; `CreditLimitProblem = Problem + {balance, creditLimit, attempted}`.
  - `Customer {id, name, phone, balance, creditLimit}`; `NewCustomer {name, phone}`.
- Operasi (tag → `operationId`):

| Method & path | operationId | Sukses | Error |
|---|---|---|---|
| `GET /api/users/kasir` | `listKasirUsers` | 200 `User[]` | — |
| `POST /api/auth/pin-login` `{userId, pin}` | `pinLogin` | 200 `Session` | 401 `PIN_INVALID`, 423 `LOCKED_OUT` |
| `GET /api/auth/session` | `getSession` | 200 `Session` | 401 `UNAUTHORIZED` |
| `POST /api/auth/logout` | `logout` | 204 | — |
| `GET /api/shifts/current` | `getCurrentShift` | 200 `CurrentShift` | — |
| `POST /api/shifts` `{openingCash}` | `openShift` | 201 `Shift` | 401, 409 `SHIFT_ALREADY_OPEN`, 422 `VALIDATION` |
| `POST /api/shifts/current/close` `{countedCash}` | `closeShift` | 200 `ShiftClosure` | 401, 409 `SHIFT_CLOSED`, 422 |
| `GET /api/settings/kasir` | `getKasirSettings` | 200 `KasirSettings` | — |
| `GET /api/catalog/lookup?code=` | `lookupCatalog` | 200 `CatalogMatch` | 404 `NOT_FOUND` |
| `GET /api/catalog/search?q=` | `searchCatalog` | 200 `CatalogMatch[]` (maks 8) | — |
| `GET /api/catalog/quick-curah` | `listQuickCurah` | 200 `CatalogMatch[]` | — |
| `POST /api/sales` `SaleRequest` | `createSale` | 201 `Sale` (200 bila `saleId` sudah ada) | 401, 409 `SHIFT_CLOSED` / `PRICE_CHANGED` / `CREDIT_LIMIT`, 401 `PIN_INVALID`, 422 `VALIDATION` / `INVALID_QUANTITY` |
| `GET /api/sales/today` | `listTodaySales` | 200 `Sale[]` (terbaru dulu) | 401 |
| `POST /api/sales/{saleId}/print` | `printSale` | 200 `PrintResult` | 404 |
| `POST /api/sales/{saleId}/void` `VoidRequest` | `voidSale` | 200 `Sale` | 403 `PIN_REQUIRED`, 401 `PIN_INVALID`, 404, 422 |
| `GET /api/customers?q=` | `searchCustomers` | 200 `Customer[]` | — |
| `POST /api/customers` `NewCustomer` | `createCustomer` | 201 `Customer` | 422 |

- [ ] **Step 1: Tulis kontrak dan test**

```ts
test("skema zod createSale menolak body tanpa saleId", () => { expect(createSaleBody.safeParse({ items: [], payments: [], print: true }).success).toBe(false); });
test("priceChangedProblemSchema cocok dengan tipe hasil generate", () => { expectTypeOf<z.infer<typeof priceChangedProblemSchema>>().toMatchTypeOf<PriceChangedProblem>(); });
test("ErrorCode tetap 13 kode F1", () => { expect(Object.values(ErrorCode)).toHaveLength(13); });
```
(nama ekspor zod mengikuti hasil orval; sesuaikan nama di test dengan yang dihasilkan.)

- [ ] **Step 2: Generate & jalankan** — `npm run gen && npx vitest run src/shared/api/contract.test.ts` → PASS setelah kontrak lengkap; `npm run typecheck` bersih.
- [ ] **Step 3: Commit** — `feat(api): kontrak endpoint kasir`

---

### Task 3: Logika murni — harga, pesan error, bunyi

**Files:**
- Create: `web/src/shared/lib/pricing.ts`, `web/src/shared/lib/error-messages.ts`, `web/src/shared/lib/beep.ts`
- Test: `pricing.test.ts`, `error-messages.test.ts`, `beep.test.ts` (di folder yang sama)

**Interfaces:**
- Consumes: `lineSubtotal`, `qtyBaseFromAmount`, `formatGram` (quantity.ts); tipe `ProductUnit`, `WholesaleTier` (gen).
- Produces:
  - `unitPriceFor(unit: Pick<ProductUnit, "price"|"unitSize"|"wholesaleTiers">, qtyBase: number): { unitPrice: number; wholesale: boolean }` — `count = qtyBase / unitSize`; tier dengan `minQty` terbesar yang ≤ `count` (hanya bila `count` bilangan bulat), selain itu harga normal.
  - `priceLine(unit, input: { qtyBase: number } | { amount: number }): { qtyBase: number; unitPrice: number; subtotal: number; wholesale: boolean }`.
  - `cartTotal(subtotals: readonly number[]): number` (lempar `RangeError` bila tidak aman).
  - `pesanError(error: unknown): string` — tabel di Step 1.
  - `beep(kind: "ok" | "error"): void` — WebAudio oscillator (ok 880 Hz 80 ms, error 220 Hz 250 ms); no-op bila `AudioContext` tidak ada.

- [ ] **Step 1: Tulis test yang gagal**

```ts
const indomiePcs = { price: 3100, unitSize: 1, wholesaleTiers: [{ minQty: 40, price: 2800 }] };
test.each([
  [indomiePcs, 1, { unitPrice: 3100, wholesale: false }],
  [indomiePcs, 39, { unitPrice: 3100, wholesale: false }],
  [indomiePcs, 40, { unitPrice: 2800, wholesale: true }],
])("unitPriceFor", (u, q, want) => expect(unitPriceFor(u, q)).toEqual(want));
test("priceLine berat: gula 1,5 kg", () => expect(priceLine({ price: 18000, unitSize: 1000, wholesaleTiers: [] }, { qtyBase: 1500 })).toEqual({ qtyBase: 1500, unitPrice: 18000, subtotal: 27000, wholesale: false }));
test("priceLine nominal: beras Rp20.000", () => expect(priceLine({ price: 18000, unitSize: 1000, wholesaleTiers: [] }, { amount: 20000 })).toEqual({ qtyBase: 1111, unitPrice: 18000, subtotal: 20000, wholesale: false }));
test("priceLine grosir 40 pcs", () => expect(priceLine(indomiePcs, { qtyBase: 40 }).subtotal).toBe(112000));
test("cartTotal", () => expect(cartTotal([78000, 72000, 27000, 29000, 112000, 43500])).toBe(361500));
test.each([
  ["NETWORK", "Server tidak tersambung — coba lagi"],
  ["UNAUTHORIZED", "Sesi berakhir — masukkan PIN lagi"],
  ["PIN_INVALID", "PIN salah"],
  ["PIN_REQUIRED", "Butuh PIN pemilik"],
  ["LOCKED_OUT", "Terlalu banyak PIN salah — coba lagi dalam 5 menit"],
  ["SHIFT_CLOSED", "Shift belum dibuka"],
  ["SHIFT_ALREADY_OPEN", "Shift sudah dibuka"],
  ["PRICE_CHANGED", "Harga berubah — periksa lalu konfirmasi"],
  ["CREDIT_LIMIT", "Kasbon melebihi limit pelanggan"],
  ["INVALID_QUANTITY", "Jumlah tidak valid"],
  ["NOT_FOUND", "Data tidak ditemukan"],
  ["INTERNAL", "Terjadi kesalahan di server"],
])("pesanError(%s)", (code, msg) => expect(pesanError(new ApiError({ status: 0, code }))).toBe(msg));
test("VALIDATION memakai detail bila ada", () => expect(pesanError(new ApiError({ status: 422, code: "VALIDATION", detail: "Pelanggan wajib dipilih" }))).toBe("Pelanggan wajib dipilih"));
test("error non-ApiError → pesan umum", () => expect(pesanError(new Error("x"))).toBe("Terjadi kesalahan di server"));
test("beep tidak melempar tanpa AudioContext", () => { expect(() => beep("ok")).not.toThrow(); });
```
(Sesuaikan konstruktor `ApiError` dengan bentuk aslinya di `fetcher.ts`.)

- [ ] **Step 2: Jalankan, pastikan gagal** — `npx vitest run src/shared/lib` → FAIL.
- [ ] **Step 3: Implementasi** sesuai Interfaces.
- [ ] **Step 4: Jalankan test** → PASS.
- [ ] **Step 5: Commit** — `feat(web): logika harga grosir/curah, pesan error, dan bunyi`

---

### Task 4: Data contoh & state backend palsu v2

**Files:**
- Create: `web/src/mocks/seed-data.ts`; Modify: `web/src/mocks/db.ts`, `web/src/mocks/seed.ts`
- Create: `web/public/qris-contoh.svg` (pola kotak hitam-putih statis, tanpa teks merek)
- Test: `web/src/mocks/seed-data.test.ts`, `web/src/mocks/db.test.ts`

**Interfaces:**
- Consumes: `rng()` (seed.ts; tanpa argumen memakai seed tetap proyek), tipe gen.
- Produces:
  - `type MockUser = User & { pin: string }`; `type MockShift = Shift & { cashSales: number; salesCount: number }`.
  - `MockState` v2: `{ version: 2; store; users: MockUser[]; session: { userId: string } | null; pinFailures: Record<string, { count: number; lockedUntil: number | null }>; shift: MockShift | null; closedShifts: ShiftClosure[]; products: Product[]; stock: Record<string, number> /* productId → qtyBase */; sales: Sale[]; customers: Customer[]; settings: KasirSettings; saleSeq: Record<string, number> /* "YYYYMMDD" → n */ }`. `isState` mewajibkan `version === 2`; versi lain → default.
  - `createSeedState(): MockState` deterministik.
  - Fixture wajib (nilai persis):

| Barang | storeCode | Satuan (unitSize, harga, barcode, grosir) |
|---|---|---|
| Indomie Goreng | `1001` | pcs (1, 3100, `089686010947`, `[{minQty:40, price:2800}]`); dus (40, 112000, `189686010944`) |
| Beras Pandan Wangi 5 kg | `1002` | pcs (1, 78000, `8991002101012`) |
| Minyak Goreng Bimoli 2 L | `1003` | pcs (1, 36000, `8992696404441`) |
| Kopi Kapal Api 165 g | `1004` | pcs (1, 14500, `8991002105126`) |
| Gula Pasir (curah, gram) | `2001` | kg (1000, 18000) |
| Beras (curah, gram) | `2002` | kg (1000, 14000) |
| Telur Ayam (curah, gram) | `2003` | kg (1000, 29000) |
| Minyak Goreng (curah, ml) | `2004` | L (1000, 17000) |
| Tepung Terigu (curah, gram) | `2005` | kg (1000, 13000) |

  - Sisa barang dibangkitkan deterministik sampai total **60 barang** (nama sembako realistis per kategori: beras, minyak, gula, mie, kopi/teh, susu, bumbu, sabun, minuman), barcode 13 digit unik, `storeCode` mulai `1101`.
  - Users: `Rina` (kasir, PIN `123456`), `Budi` (kasir, `654321`), `Pak Ahmad` (pemilik, `999999`).
  - Customers: `Bu Sari` (limit 500000, saldo 120000), `Pak Joko` (300000, 290000), `Mbak Dewi` (500000, 0), `Pak Udin` (200000, 50000), `Bu Tini` (1000000, 640000).
  - Settings: `storeName "ShaziaMart"`, `autoPrint true`, `curahFractions [250, 500, 1000, 1500, 2000]`, `quickCurahProductIds` = 5 barang curah di atas berurutan, `qrisImageUrl "/qris-contoh.svg"`, `allowNegativeStock true`.
  - Stok awal 20–200 per barang (rng); `mockDb.reset()` memakai `createSeedState()`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("60 barang, storeCode & barcode unik", () => { const s = createSeedState(); expect(s.products).toHaveLength(60); /* Set ukuran sama dengan jumlah */ });
test("fixture Indomie dus 40 pcs Rp112.000", () => { /* unit dus: unitSize 40, price 112000, barcodes ["189686010944"] */ });
test("deterministik", () => expect(createSeedState()).toEqual(createSeedState()));
test("state versi lama di localStorage diganti default v2", () => { localStorage.setItem("mock.db", JSON.stringify({ store: { id: "x", name: "y" } })); __resetMockDbCacheForTests(); expect(mockDb.get().version).toBe(2); });
test("PIN seed", () => { /* Rina 123456, Budi 654321, Pak Ahmad pemilik 999999 */ });
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan test** — `npx vitest run src/mocks` → PASS.
- [ ] **Step 5: Commit** — `feat(mock): data contoh 60 barang sembako dan state v2`

---

### Task 5: Handler palsu — auth, shift, pengaturan, katalog

**Files:**
- Create: `web/src/mocks/handlers/auth.ts`, `shift.ts`, `settings.ts`, `catalog.ts`; Modify: `handlers/index.ts`
- Create: `web/src/mocks/handlers/respond.ts` (`problem(status, code, detail?, extra?)` → `HttpResponse` problem+json; `requireSession(state)`)
- Test: `web/src/mocks/handlers/auth-shift.test.ts`, `catalog.test.ts`

**Interfaces:**
- Consumes: `mockDb`, `withScenario`, tipe gen.
- Produces (semua handler dibungkus `withScenario`):
  - `pin-login`: PIN cocok → `session = {userId}`, reset `pinFailures`; salah → +1, ke-5 → `lockedUntil = now + 300000`; saat terkunci → 423 `LOCKED_OUT` (bahkan PIN benar).
  - `logout` → `session = null` (shift tetap).
  - `openShift` butuh sesi; `openingCash` safe integer ≥ 0 (else 422); sudah ada shift → 409 `SHIFT_ALREADY_OPEN`.
  - `closeShift`: `expectedCash = openingCash + cashSales`; `difference = countedCash − expectedCash`; simpan ke `closedShifts`, `shift = null`, `session = null`.
  - `lookup`: cocokkan barcode satuan mana pun, lalu `storeCode` (→ satuan pertama); `searchCatalog`: nama mengandung `q` (tanpa beda huruf besar/kecil, minimal 2 huruf), maks 8, urut nama; `quick-curah` sesuai `settings.quickCurahProductIds`.

- [ ] **Step 1: Tulis test yang gagal** (fetch langsung ke server MSW node)

```ts
test("login PIN benar membuat sesi", async () => { /* POST pin-login Rina 123456 → 200 {user.name "Rina"}; GET session → 200 */ });
test("5x PIN salah → 423, PIN benar tetap ditolak sampai 5 menit lewat", async () => { /* fake Date: 5x 401 PIN_INVALID, ke-6 benar → 423 LOCKED_OUT; maju 300000 ms → 200 */ });
test("buka shift tanpa sesi → 401; dua kali → 409 SHIFT_ALREADY_OPEN", async () => {});
test("tutup shift menghitung selisih", async () => { /* modal 200000, cashSales diisi 150000 via mockDb.update, countedCash 345000 → expectedCash 350000, difference -5000; shift null; session null */ });
test("lookup barcode dus Indomie → unit dus", async () => { /* code 189686010944 → unitId dus */ });
test("lookup kode toko 2001 → Gula Pasir unit kg", async () => {});
test("lookup tidak dikenal → 404 NOT_FOUND", async () => {});
test("search 'indo' ≤ 8 hasil, 'i' → []", async () => {});
test("server-mati → semua endpoint gagal jaringan", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan test** — `npx vitest run src/mocks/handlers` → PASS.
- [ ] **Step 5: Commit** — `feat(mock): auth PIN, shift, pengaturan, dan katalog`

---

### Task 6: Handler palsu — penjualan & pelanggan

**Files:**
- Create: `web/src/mocks/handlers/sales.ts`, `customers.ts`, `web/src/mocks/sale-number.ts`
- Test: `web/src/mocks/handlers/sales.test.ts`, `customers.test.ts`, `web/src/mocks/sale-number.test.ts`

**Interfaces:**
- Consumes: `priceLine`, `cartTotal` (pricing.ts), `respond.ts`, `mockDb`, `getScenario`.
- Produces — aturan `createSale` berurutan:
  1. Tanpa sesi → 401 `UNAUTHORIZED`; tanpa shift → 409 `SHIFT_CLOSED`.
  2. `saleId` sudah ada → **200** penjualan yang sama, tanpa efek samping.
  3. Validasi item: unit ada; tepat satu dari `qtyBase`/`amount`; `amount` hanya untuk curah; nilai safe integer > 0 → else 422 `INVALID_QUANTITY`.
  4. Skenario `harga-berubah`: bila `saleId` ini belum pernah ditolak, naikkan harga satuan item pertama +500 di katalog dan tandai `saleId`.
  5. Bandingkan `expectedUnitPrice` dengan harga efektif server (`unitPriceFor`) → ada yang beda → 409 `PRICE_CHANGED` dengan `changes`.
  6. Total = `cartTotal(subtotal)`. Pembayaran: jumlah `payments.amount` harus = total; maksimal satu pembayaran per metode; `cash` butuh `cashReceived ≥ amount` → `change = cashReceived − amount`; `credit` butuh `customerId` → else 422 `VALIDATION` (`detail` "Pelanggan wajib dipilih").
  7. Kasbon: `balance + creditAmount > creditLimit` → tanpa `ownerPin` 409 `CREDIT_LIMIT` (+`balance`, `creditLimit`, `attempted`); `ownerPin` salah → 401 `PIN_INVALID`; benar → lanjut.
  8. Efek: stok −`qtyBase`; saldo pelanggan +kredit; `shift.cashSales` +cash, `salesCount` +1; nomor struk `YYYYMMDD-NNNN` (tanggal Asia/Jakarta, urut per hari); `printStatus` = `print ? (skenario printer-gagal ? "gagal" : "tercetak") : "tidak_dicetak"`; 201.
  - `voidSale`: `ownerPin` kosong → 403 `PIN_REQUIRED`; salah → 401 `PIN_INVALID`; `reason` kosong → 422; sudah dibatalkan → 200 apa adanya; efek balik: stok +, saldo −, `cashSales` −cash; `status "dibatalkan"`.
  - `printSale` → `printStatus` sesuai skenario, disimpan ke penjualan.
  - `listTodaySales`: penjualan hari ini (Asia/Jakarta), terbaru dulu.
  - `searchCustomers`: nama/telepon mengandung `q` (kosong → semua), maks 20; `createCustomer`: nama ≥ 2 huruf, telepon 8–15 digit → else 422; `creditLimit` default 500000, saldo 0.
  - `formatSaleNumber(createdAt: number, seq: number): string` di `sale-number.ts`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("formatSaleNumber zona Asia/Jakarta", () => expect(formatSaleNumber(Date.UTC(2026, 9, 16, 18, 30), 42)).toBe("20261017-0042"));
test("penjualan tunai: total server, kembalian, stok berkurang", async () => { /* login+shift; Beras PW ×1 + Bimoli ×2 + gula 1500 g + telur 1000 g + Indomie dus ×1 + Kapal Api ×3 → total 361500; cash 361500, cashReceived 400000 → 201, change 38500, number "YYYYMMDD-0001" */ });
test("saleId sama dikirim dua kali → 200 & hanya satu penjualan", async () => {});
test("nominal curah: amount 20000 gula → qtyBase 1111, subtotal 20000", async () => {});
test("amount pada barang non-curah → 422 INVALID_QUANTITY", async () => {});
test("harga-berubah: pertama 409 PRICE_CHANGED (+500), kirim ulang dengan harga baru → 201", async () => {});
test("kasbon melebihi limit → 409 CREDIT_LIMIT; ownerPin salah → 401; ownerPin 999999 → 201 & saldo naik", async () => { /* Pak Joko saldo 290000 limit 300000, kredit 36000 */ });
test("kredit tanpa customerId → 422 'Pelanggan wajib dipilih'", async () => {});
test("jumlah pembayaran ≠ total → 422", async () => {});
test("printer-gagal → printStatus gagal; print false → tidak_dicetak", async () => {});
test("void: tanpa PIN 403, PIN salah 401, benar → dibatalkan & stok kembali", async () => {});
test("tanpa shift → 409 SHIFT_CLOSED", async () => {});
test("createCustomer validasi telepon", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan test** → PASS.
- [ ] **Step 5: Commit** — `feat(mock): penjualan idempoten, kasbon, batal, dan pelanggan`

---

### Task 7: Store keranjang (Zustand)

**Files:**
- Create: `web/src/features/kasir/cart/cart-store.ts`, `web/src/features/kasir/cart/cart-view.ts`
- Test: `web/src/features/kasir/cart/cart-store.test.ts`, `cart-view.test.ts`

**Interfaces:**
- Consumes: `id.New`-setara di web: `newSaleId(): string` (UUIDv7) — buat di `web/src/shared/lib/id.ts` (`npm i uuid` bila perlu; harus versi 7); `priceLine` (pricing.ts); tipe `CatalogMatch`, `PriceChange`.
- Produces:
  ```ts
  type CartLine = { lineId: string; unitId: string; productId: string; productName: string; unitName: string; isCurah: boolean; baseUnit: "pcs"|"gram"|"ml"; unitSize: number; listPrice: number; wholesaleTiers: WholesaleTier[]; qtyBase: number; amount: number | null };
  type HeldCart = { id: string; label: string; heldAt: number; saleId: string; lines: CartLine[] };
  type CartState = { saleId: string; lines: CartLine[]; selectedLineId: string | null; lastAddedLineId: string | null; printReceipt: boolean | null; held: HeldCart[]; lastChange: number | null };
  useCart // zustand + persist (key "kasir.cart", localStorage)
  actions: addUnit(match: CatalogMatch): void; addCurah(match: CatalogMatch, input: { qtyBase: number } | { amount: number }): void;
           increment(lineId): void; decrement(lineId): void /* min 1 satuan */; remove(lineId): void;
           select(lineId | null): void; selectNext(): void; selectPrev(): void;
           setPrintReceipt(value: boolean): void; applyPriceChanges(changes: PriceChange[]): void;
           completeSale(change: number): void /* kosongkan baris, saleId baru, lastChange = change, printReceipt = null */;
           clearLastChange(): void; hold(): void; resume(heldId: string): void;
  cartLineView(line: CartLine, index: number): { no: number; qtyLabel: string; priceLabel: string; unitPrice: number; subtotal: number; wholesale: boolean }
  cartSummary(lines: CartLine[]): { itemCount: number; total: number }
  ```
  - `addUnit` non-curah: unit sama → qty +1 satuan (`qtyBase += unitSize`) pada baris itu; barang curah lewat `addCurah` saja (`addUnit` untuk curah tidak menambah baris). `lastAddedLineId` & `selectedLineId` = baris itu; `lastChange = null`.
  - `addCurah` selalu baris baru.
  - `qtyLabel`: non-curah `"{count} {unitName}"` (mis. `2 pcs`, `1 dus`); curah `formatGram(qtyBase, unit)` (`1,5 kg`; untuk ml → `L`). `priceLabel`: non-curah `formatAngka(unitPrice)`; curah `"{formatAngka(listPrice)}/{unitName}"` (`18.000/kg`).
  - `hold`: keranjang kosong → no-op; label `Keranjang {n}` (n = urutan sejak 1); setelah hold keranjang kosong dengan `saleId` baru. `resume`: bila keranjang aktif berisi, tahan dulu; lalu pulihkan baris & `saleId` milik keranjang ditahan.
  - `applyPriceChanges`: set `listPrice` (untuk unit tanpa tier) — dan untuk unit bertier, perbarui `listPrice` bila perubahan berlaku pada harga normal; baris tetap.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("scan Indomie pcs dua kali → satu baris 2 pcs", () => {});
test("Indomie pcs dan dus → dua baris", () => {});
test("addCurah gula 1500 g → baris '1,5 kg' '18.000/kg' subtotal 27000", () => {});
test("addCurah nominal 20000 → subtotal 20000, qtyLabel '1,111 kg'", () => {});
test("decrement tidak di bawah 1 satuan; remove menghapus", () => {});
test("selectNext/selectPrev berputar dalam batas (tidak melewati ujung)", () => {});
test("cartSummary contoh spec → 6 barang, total 361500", () => {});
test("completeSale: baris kosong, saleId baru, lastChange tersimpan", () => {});
test("persist: state dipulihkan dari localStorage (saleId & baris sama)", () => { /* tulis state, buat store baru via rehydrate, bandingkan */ });
test("setelah completeSale, rehydrate tidak memunculkan baris lama", () => {});
test("hold lalu resume mengembalikan saleId & baris; resume saat keranjang berisi menahan yang aktif", () => {});
test("applyPriceChanges mengubah harga baris", () => {});
```
(Baris "≈" hanya dipakai jendela curah; label baris keranjang tanpa "≈".)

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi** — `npm i zustand`.
- [ ] **Step 4: Jalankan test** → PASS.
- [ ] **Step 5: Commit** — `feat(kasir): store keranjang dengan grosir, curah, tahan, dan persist`

---

### Task 8: Deteksi scan & kolom scan/cari

**Files:**
- Create: `web/src/features/kasir/scan/use-scan-detector.ts`, `web/src/features/kasir/scan/scan-box.tsx`
- Test: `use-scan-detector.test.tsx`, `scan-box.test.tsx`

**Interfaces:**
- Consumes: `useLookupCatalog`/`lookupCatalog`, `useSearchCatalog` (gen), `useCart`, `beep`, `pesanError`, Sonner `toast`.
- Produces:
  - `useScanDetector(onScan: (code: string) => void): void` — listener `keydown` di `window`; aktif hanya bila `document.activeElement` bukan input/textarea/select/contenteditable **dan** tidak ada elemen `[role="dialog"]` terbuka; karakter dengan jeda < 30 ms dikumpulkan; `Enter` dengan ≥ 4 karakter → `onScan`; jeda ≥ 30 ms mengulang buffer.
  - `<ScanBox onResolved={(match) => void} onCurah={(match) => void} />` — input `aria-label="Scan barcode / ketik nama atau kode"` dan placeholder sesuai tabel; selalu fokus otomatis (`autoFocus` + `focus()` setelah aksi lewat `useScanFocus()` yang diekspor: `{ ref, refocus }`).
    - `Enter` dengan teks semua digit → `lookupCatalog(code)`; cocok non-curah → `addUnit` + `beep("ok")`; cocok curah → `onCurah(match)`; 404 → toast `Barang tidak ditemukan` + `beep("error")`; teks lalu dikosongkan.
    - Teks ≥ 2 huruf yang bukan semua digit → `searchCatalog` (debounce 150 ms) → daftar hasil (maks 8, `role="listbox"`); `↑`/`↓` memilih, `Enter` menambah pilihan, `Esc` menutup daftar.
    - Saat daftar tertutup: `↑`/`↓` → `selectPrev`/`selectNext` keranjang; `Delete` dengan input kosong → `remove(selectedLineId)`.
  - Detector dipasang di layar kasir (Task 9) dengan `onScan` = jalur lookup yang sama.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("ketikan cepat + Enter → onScan dengan kode", () => { /* fake timers: kirim 12 digit dengan jeda 5 ms lalu Enter, fokus di body */ });
test("ketikan lambat (jeda 60 ms) tidak dianggap scan", () => {});
test("scan diabaikan saat dialog terbuka", () => { /* render elemen role=dialog; kirim scan → onScan tidak dipanggil */ });
test("Enter kode 089686010947 → baris Indomie pcs bertambah", async () => {});
test("Enter kode 2001 → onCurah dipanggil, keranjang tidak berubah", async () => {});
test("kode tidak dikenal → toast 'Barang tidak ditemukan'", async () => {});
test("ketik 'kopi' → daftar hasil, ↓ Enter menambah", async () => {});
test("Delete dengan input kosong menghapus baris terpilih; dengan input berisi tidak", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan test** → PASS.
- [ ] **Step 5: Commit** — `feat(kasir): deteksi scan dan kolom scan/cari`

---

### Task 9: Layar kasir — tabel keranjang, panel total, tombol curah, ditahan

**Files:**
- Create: `web/src/features/kasir/screen/kasir-screen.tsx`, `cart-table.tsx`, `total-panel.tsx`, `quick-curah-strip.tsx`, `held-carts-sheet.tsx`
- Modify: `web/src/features/kasir/kasir-page.tsx` (render `KasirScreen`), `kasir-layout.tsx` (tombol header aktif: `Riwayat`, `Kunci`, `Tutup shift` — handler dari Task 12/13 lewat props/context; di task ini boleh tetap nonaktif kecuali sudah tersedia)
- Test: `kasir-screen.test.tsx`

**Interfaces:**
- Consumes: `useCart`, `cartLineView`, `cartSummary`, `ScanBox`, `useScanDetector`, `useServerHealth`, `useGetKasirSettings`, `useListQuickCurah`, `formatRupiah`.
- Produces:
  - `CartTable`: `<table>` dengan header `NO.` `BARANG` `QTY` `HARGA` `SUBTOTAL`; label `curah` dan tag `grosir`; baris `lastAddedLineId` ber-latar `bg-success-soft`; baris terpilih `aria-selected="true"` menampilkan tombol `−` `+` (non-curah) dan `Hapus` (`aria-label` `Kurangi`, `Tambah`, `Hapus`); klik baris memilih; angka `num`.
  - `TotalPanel`: `{n} BARANG · TOTAL` + `formatRupiah(total)` (30px); bila `lastChange !== null` tampil `KEMBALIAN` + nominal besar (32px) di panel; checkbox `Cetak struk` (default `printReceipt ?? settings.autoPrint`); tombol `Tahan transaksi`; tombol `Ditahan ({n})` bila ada; tombol `Bayar` (`size="lg"`) nonaktif bila keranjang kosong **atau** `!online`; `onPay()`.
  - `QuickCurahStrip`: tombol per barang dari `listQuickCurah` (`{nama} curah` → mis. `Gula Pasir curah`), klik → `onCurah(match)`.
  - `KasirScreen` menyusun semuanya dan menyimpan state dialog (`curah: CatalogMatch | null`, `payOpen: boolean`); setelah tiap aksi `refocus()`.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("tabel menampilkan kolom dan baris contoh spec, total Rp361.500", async () => { /* isi store dengan 6 baris contoh */ });
test("baris terakhir ditambah disorot", async () => {});
test("klik baris → tombol − + Hapus; + menambah qty", async () => {});
test("Bayar nonaktif saat keranjang kosong dan saat server-mati", async () => {});
test("Tahan transaksi lalu Ditahan (1) → Lanjutkan memulihkan", async () => {});
test("tombol Gula Pasir curah membuka jendela curah (prop onCurah terpanggil)", async () => {});
test("kembalian setelah transaksi tampil sampai barang berikutnya ditambah", async () => {});
test("tidak ada handler tombol F (keydown F12 tidak membuka bayar)", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL.
- [ ] **Step 3: Implementasi** mengikuti mockup spec bagian 4.
- [ ] **Step 4: Jalankan test** → PASS; cek manual `npm run dev` → `/kasir` sesuai mockup.
- [ ] **Step 5: Commit** — `feat(kasir): layar kasir dengan tabel keranjang dan panel total`

---

### Task 10: Jendela curah

**Files:**
- Create: `web/src/features/kasir/curah/curah-dialog.tsx`; Test: `curah-dialog.test.tsx`

**Interfaces:**
- Consumes: `parseKg`, `parseRupiah`, `formatGram`, `formatApproxKg`, `priceLine`, `formatRupiah`, `useGetKasirSettings` (`curahFractions`), `useCart().addCurah`.
- Produces: `<CurahDialog match: CatalogMatch | null; onClose(): void />` — judul nama barang + `Rp{harga} / {unit}`; tab `Berat (kg)` (atau `Berat (L)` untuk `ml`) dan `Nominal (Rp)`; tombol pecahan dari `curahFractions` dengan label `¼` `½` `1` `1½` `2` (250/500/1000/1500/2000; nilai lain → `formatGram` tanpa satuan); `HARGA` menampilkan subtotal; mode nominal menampilkan `≈ x,xxx kg`; `Masukkan` (dan `Enter`) nonaktif bila nilai kosong/tidak valid; `Esc` menutup; setelah masuk → `addCurah`, tutup, fokus kembali ke kolom scan.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("ketik 1,5 → HARGA Rp27.000; Masukkan → baris 1,5 kg", async () => {});
test("tombol 1½ mengisi 1,5", async () => {});
test("mode Nominal 20.000 → '≈ 1,111 kg', subtotal Rp20.000", async () => {});
test("Minyak curah memakai label 'Berat (L)' dan '≈ … L'", async () => {});
test("nilai 0 / kosong / '1,2345' → Masukkan nonaktif", async () => {});
test("Enter memasukkan, Esc menutup tanpa menambah", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL. **Step 3:** implementasi sesuai mockup spec bagian 6. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(kasir): jendela curah berat dan nominal`

---

### Task 11: Jendela bayar, harga berubah, PIN pemilik

**Files:**
- Create: `web/src/features/kasir/payment/payment-dialog.tsx`, `payment-model.ts`, `price-changed-dialog.tsx`, `web/src/features/kasir/shared/owner-pin-dialog.tsx`, `customer-picker.tsx`
- Test: `payment-model.test.ts`, `payment-dialog.test.tsx`

**Interfaces:**
- Consumes: `quickCashOptions`, `parseRupiah`, `formatRupiah`, `useCreateSale`, `useSearchCustomers`, `useCreateCustomer`, `readProblem` + skema (Task 1–2), `pesanError`, `useCart`, `useServerHealth`.
- Produces:
  - `type PaymentChoice = { kind: "tunai"; received: number } | { kind: "qris" } | { kind: "kasbon"; customerId: string } | { kind: "campuran"; firstMethod: "cash" | "qris"; firstAmount: number; received: number | null; customerId: string }`.
  - `buildSaleRequest(cart: Pick<CartState, "saleId" | "lines">, choice: PaymentChoice, print: boolean, ownerPin?: string): SaleRequest` — item: curah ber-`amount` → `{unitId, amount, expectedUnitPrice}`, lainnya `{unitId, qtyBase, expectedUnitPrice}` (`expectedUnitPrice` dari `cartLineView`); pembayaran: tunai `[{cash,total}]` + `cashReceived`; qris `[{qris,total}]`; kasbon `[{credit,total}]` + `customerId`; campuran `[{firstMethod, firstAmount}, {credit, total − firstAmount}]` (+ `cashReceived` bila cash).
  - `paymentState(total: number, choice draft): { canSubmit: boolean; change: number | null; shortage: number | null }`.
  - `<PaymentDialog open; onClose(); onPaid(sale: Sale) />` — tab `Tunai` `QRIS` `Kasbon` `Campuran`; tunai: input `UANG DITERIMA` (diketik `400.000`/`400000`), tombol `Uang pas` + 3 nominal dari `quickCashOptions`, `KEMBALIAN` besar atau `KURANG {Rp…}` merah; QRIS: gambar `settings.qrisImageUrl` (`alt="QRIS toko"`) + nominal + tombol `Sudah masuk`; kasbon: `CustomerPicker` (cari nama/telepon, `Tambah pelanggan` nama+telepon) menampilkan saldo & limit; campuran: pilih `Tunai`/`QRIS` untuk bagian pertama + nominal, sisanya kasbon otomatis; checkbox `Cetak struk`; `Selesai` (`Enter`) nonaktif bila `!canSubmit` **atau** request berjalan **atau** `!online`.
  - Alur kirim: `createSale(buildSaleRequest(...))` →
    - sukses → `completeSale(change ?? 0)`, tutup, `onPaid`; bila `printStatus === "gagal"` toast `Struk gagal dicetak — cetak ulang dari Riwayat`.
    - 409 `PRICE_CHANGED` → `<PriceChangedDialog>` daftar `{nama}: Rp{lama} → Rp{baru}`; `Konfirmasi & simpan` → `applyPriceChanges` lalu kirim ulang (`saleId` sama).
    - 409 `CREDIT_LIMIT` → `<OwnerPinDialog title="PIN pemilik" requireReason={false}>`; PIN → kirim ulang dengan `ownerPin`; 401 `PIN_INVALID` → pesan di dialog PIN.
    - lainnya → `pesanError` tampil di jendela bayar; keranjang tetap, jendela tetap terbuka.
  - `<OwnerPinDialog open; title; requireReason: boolean; onSubmit(pin, reason?) ; error?: string />` — input PIN `type="password"` `inputMode="numeric"` 6 digit; dipakai juga Task 13.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("buildSaleRequest tunai contoh spec", () => { /* total 361500, received 400000 → payments [{cash,361500}], cashReceived 400000, item gula {qtyBase:1500}, beras nominal {amount:20000} */ });
test("paymentState: 400.000 → change 38500; 350000 → shortage 11500, canSubmit false; kosong → canSubmit false", () => {});
test("campuran: firstAmount ≥ total atau ≤ 0 → canSubmit false", () => {});
```
```tsx
test("tunai: ketik 400.000 → KEMBALIAN Rp38.500; Selesai → keranjang kosong, kembalian di panel", async () => {});
test("tombol nominal cepat untuk Rp361.500: Uang pas, 370.000, 400.000, 500.000", async () => {});
test("uang kurang → 'KURANG Rp11.500' dan Selesai nonaktif", async () => {});
test("Selesai diklik dua kali → hanya satu POST /api/sales", async () => {});
test("server-mati saat Selesai → 'Server tidak tersambung — coba lagi', keranjang tetap; coba lagi setelah normal memakai saleId sama", async () => {});
test("harga-berubah → dialog Harga berubah; Konfirmasi & simpan → tersimpan", async () => {});
test("kasbon Pak Joko 36.000 → CREDIT_LIMIT → PIN pemilik 999999 → tersimpan", async () => {});
test("QRIS: Sudah masuk menyimpan dengan method qris", async () => {});
test("campuran tunai 200.000 + sisa kasbon Bu Sari", async () => {});
test("printer-gagal → toast struk gagal", async () => {});
test("Esc menutup jendela bayar tanpa menyimpan", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL. **Step 3:** implementasi sesuai mockup spec bagian 5. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(kasir): jendela bayar tunai/QRIS/kasbon/campuran dan harga berubah`

---

### Task 12: Gerbang shift — buka shift, kunci layar, tutup shift

**Files:**
- Create: `web/src/features/kasir/shift/kasir-gate.tsx`, `open-shift-screen.tsx`, `lock-screen.tsx`, `close-shift-dialog.tsx`, `use-idle-lock.ts`, `pin-pad.tsx`
- Modify: `web/src/features/kasir/kasir-layout.tsx` (header: nama kasir + jam buka shift, tombol `Riwayat` `Kunci` `Tutup shift`), `kasir-page.tsx`
- Test: `kasir-gate.test.tsx`, `use-idle-lock.test.ts`, `close-shift-dialog.test.tsx`

**Interfaces:**
- Consumes: `useGetSession`, `useGetCurrentShift`, `useListKasirUsers`, `usePinLogin`, `useLogout`, `useOpenShift`, `useCloseShift`, `parseRupiah`, `formatRupiah`, `pesanError`.
- Produces:
  - `<KasirGate>{children}</KasirGate>`: belum ada shift → `OpenShiftScreen`; ada shift tapi tanpa sesi → `LockScreen` (kasir shift); keduanya ada → children. 401 `UNAUTHORIZED` dari query mana pun → invalidate sesi (jatuh ke `LockScreen`).
  - `OpenShiftScreen`: judul `Buka shift`; pilih kasir (tombol per nama) → `PinPad` (`PIN`, 6 digit, `Enter`) → `Modal awal di laci` (Rp) → tombol `Buka shift` → `pinLogin` lalu `openShift`.
  - `LockScreen`: judul `Layar terkunci`, nama kasir shift, `PinPad`; PIN benar → `pinLogin` → children; keranjang tidak berubah.
  - `useIdleLock(onLock: () => void, ms = 300000)`: reset pada `pointerdown`/`keydown`; lewat `ms` → `onLock`. Kunci (tombol `Kunci` atau idle) = `logout()` (shift tetap terbuka).
  - `CloseShiftDialog`: label `Uang fisik di laci`; opsi kalkulator pecahan (100.000, 50.000, 20.000, 10.000, 5.000, 2.000, 1.000, koin) yang mengisi total; **hitung buta** — uang seharusnya tidak tampil sebelum dikirim; setelah `closeShift` tampil `Uang seharusnya` · `Uang fisik` · `Selisih` (negatif merah, `formatRupiah`); tombol `Selesai` → kembali ke `OpenShiftScreen`. Keranjang berisi → konfirmasi `Keranjang masih berisi — tahan atau kosongkan dulu` dan tutup shift ditolak.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("tanpa shift → Buka shift: Rina → PIN 123456 → modal 200.000 → layar kasir", async () => {});
test("PIN salah → 'PIN salah'; 5x → 'Terlalu banyak PIN salah — coba lagi dalam 5 menit'", async () => {});
test("klik Kunci → Layar terkunci; PIN benar → kembali, keranjang utuh", async () => {});
test("idle 5 menit → terkunci (fake timers); aktivitas mereset hitungan", async () => {});
test("refresh saat terkunci tetap terkunci (sesi kosong, shift ada)", async () => {});
test("tutup shift hitung buta: uang seharusnya tidak tampil sebelum kirim; hasil selisih −Rp5.000", async () => {});
test("tutup shift ditolak saat keranjang berisi", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL. **Step 3:** implementasi. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(kasir): buka shift, kunci layar, dan tutup shift hitung buta`

---

### Task 13: Riwayat hari ini — cetak ulang & batal

**Files:**
- Create: `web/src/features/kasir/history/history-sheet.tsx`; Test: `history-sheet.test.tsx`
- Modify: `kasir-layout.tsx` (tombol `Riwayat` membuka sheet)

**Interfaces:**
- Consumes: `useListTodaySales`, `usePrintSale`, `useVoidSale`, `OwnerPinDialog` (Task 11), `formatRupiah`, `pesanError`.
- Produces: `<HistorySheet open; onClose() />` — daftar penjualan hari ini (nomor, jam `HH.mm` WIB, total, metode, status; `dibatalkan` dicoret dengan label `Dibatalkan`; `printStatus gagal` dengan label `Struk gagal`); per baris `Cetak ulang` → `printSale` (toast `Struk dicetak` atau pesan gagal); `Batalkan` → `OwnerPinDialog requireReason` → `voidSale` → daftar diperbarui; `Esc` menutup dan fokus kembali ke kolom scan.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("menampilkan penjualan hari ini terbaru dulu", async () => {});
test("Cetak ulang memanggil print dan menampilkan 'Struk dicetak'", async () => {});
test("Batalkan: PIN salah → 'PIN salah'; PIN 999999 + alasan → status Dibatalkan", async () => {});
test("alasan kosong → tombol kirim nonaktif", async () => {});
```

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL. **Step 3:** implementasi. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(kasir): riwayat hari ini dengan cetak ulang dan batal`

---

### Task 14: E2E alur kasir

**Files:**
- Create: `web/e2e/kasir-flows.spec.ts`, `web/e2e/kasir-helpers.ts` (`openShift(page, { kasir: "Rina", pin: "123456", opening: "200.000" })`, `scan(page, code)` mengetik cepat lalu Enter via `page.keyboard`)
- Modify: `web/e2e/fixtures.ts` hanya bila perlu reset state mock per test (mis. `localStorage.clear()` via `addInitScript` sekali di awal tiap test)

**Interfaces:**
- Consumes: semua task sebelumnya; fixture penjaga request & `expectNoA11yViolations` dari F1.

- [ ] **Step 1: Tulis test E2E** (project `kasir` saja)

```ts
test("jual tunai contoh spec dengan kembalian Rp38.500", async ({ page }) => { /* openShift; scan 8991002101012; Bimoli ×2; Gula 1,5 kg lewat tombol curah; Telur 1 kg; dus Indomie 189686010944; Kapal Api ×3 → total Rp361.500; Bayar → 400.000 → KEMBALIAN Rp38.500 → Selesai → panel menampilkan kembalian; Riwayat memuat 1 transaksi */ });
test("beras Rp20.000 per nominal", async ({ page }) => {});
test("kasbon melebihi limit butuh PIN pemilik", async ({ page }) => {});
test("harga-berubah: konfirmasi lalu tersimpan", async ({ page }) => { /* ?skenario=harga-berubah */ });
test("server-mati: Bayar nonaktif", async ({ page }) => {});
test("kunci layar lalu buka kembali; keranjang utuh", async ({ page }) => {});
test("tutup shift hitung buta menampilkan selisih", async ({ page }) => {});
test("refresh di tengah transaksi memulihkan keranjang", async ({ page }) => {});
test("aksesibilitas layar kasir, jendela bayar, dan jendela curah tanpa pelanggaran serius", async ({ page }) => {});
```

- [ ] **Step 2: Jalankan** — `npm run e2e` → semua lolos (F1 + F2) di 3 project.
- [ ] **Step 3: Verifikasi penuh** — `npm run lint && npm run typecheck && npm run knip && npm test && npm run gen:check && npm run build && npm run size:check` (semua komponen `shared/ui` yang kini dipakai tetap; komponen yang tetap tak terpakai di akhir F2 dihapus).
- [ ] **Step 4: Commit** — `test(e2e): alur kasir lengkap`

---

## Di luar cakupan F2 (dicatat)

- Retur sebagian barang (hanya batal penuh di F2) — menyusul bersama laporan pemilik.
- Pelunasan kasbon di kasir dan pengeluaran kas kecil (PRD K-14) — F3/pemilik lebih dulu.
- Riwayat penjualan 14 hari & data laporan di mock — F3.
- Struk fisik (ESC/POS) — backend B.
