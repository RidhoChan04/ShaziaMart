# Rencana F3b-1 — Barang & Harga Pemilik: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemilik mengelola barang dari HP/laptop: daftar dengan cari, filter, dan tanda status; detail dengan harga, modal, untung, stok, barcode, riwayat; tambah/ubah barang mengikuti template Excel (dengan scan kamera); notifikasi perubahan modal dengan harga saran; impor `data-barang.xlsx`; status Tidak diambil lagi / Nonaktif / Sedang langka — dan kasir tidak lagi menjual barang nonaktif.

**Architecture:** Kontrak diperluas dengan endpoint `/api/owner/products*`, `/api/owner/categories`, `/api/owner/product-imports*` (tag `owner`, cookie `owner_session`) plus `Attention.costChanges`/`stockOuts`. HPP disimpan per barang sebagai rasio `{amount, qtyBase}` (Rp per sekian satuan dasar) sehingga modal per dus dari nota tetap persis. Aturan validasi barang adalah fungsi murni di `shared/lib/product-rules.ts` yang dipakai form (pratinjau) dan backend palsu (resmi, termasuk impor). File .xlsx dibaca di browser oleh pembaca zip+XML buatan sendiri (tanpa dependensi) di chunk terpisah yang dimuat hanya di layar impor.

**Tech Stack:** (tetap) React 19, TS strict, TanStack Router/Query, orval + zod/mini, MSW 2, Tailwind 4 tokens, lucide-react, Vitest + Testing Library, Playwright + axe. Platform: `BarcodeDetector`, `getUserMedia`, `DecompressionStream("deflate-raw")`, `DOMParser`. Tanpa dependensi baru. Alat pengembang: Python 3 + openpyxl hanya untuk membuat ulang file template & fixture (hasilnya di-commit).

**Spec:** `docs/specs/2026-10-17-frontend-design.html` §12d (disetujui 2 Nov 2026, mengikat termasuk baris "Harga modal (HPP)" dan semua butir "Detail dari review desain") + mockup `docs/specs/assets/2026-11-02-owner-barang.html`; §8, §12a, §12b tetap berlaku; `docs/specs/2026-10-17-arsitektur-kasir-design.html` §5 (uang int, `round_half_up`, barcode per satuan & unik per toko, stok = ledger); `docs/conventions.md`. Generator template: `web/scripts/make-template.py` (Task 12, disalin dari scratchpad sesi brainstorming).

## Global Constraints

- Semua constraint F1/F2/F3a/G1 tetap; pemeriksaan wajib hijau: `lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check` (owner ≤ 50 KB gzip, chunk pembaca xlsx ≤ 25 KB, total ≤ 220 KB), `e2e`.
- **HPP, modal, untung, stok, batas stok, kategori, status tidak pernah dikirim ke endpoint kasir.** Skema kasir `Product`/`ProductUnit` tidak berubah; backend palsu memproyeksikan lewat `toKasirProduct` (satuan nonaktif dibuang).
- Uang & `qtyBase` bilangan bulat. HPP = `ProductCost {amount, qtyBase}`; modal satuan = `round_half_up(amount × unitSize ÷ qtyBase)`. Sumber HPP: modal satuan besar terisi → `{modal besar, isi × unitSize eceran}` (modal eceran diabaikan); selain itu `{modal eceran, unitSize eceran}`; keduanya kosong → `null`.
- Persen untung selalu **dari modal**: `round_half_up(|harga − modal| × 100 ÷ modal)` dengan tanda harga − modal; modal 0/kosong → tanpa persen. Selalu dilabeli `… % dari modal`.
- Harga saran = harga sekarang × modal baru ÷ modal lama, **dibulatkan ke atas ke Rp500**. Harga tidak pernah berubah otomatis: hanya lewat tombol pemilik.
- Barcode valid = EAN-13 / UPC-A / EAN-8 / **GTIN-14 (ITF-14 di dus)** dengan check digit benar (algoritma GS1 mod-10 yang sama; template perlu menyusul menerima 14 digit — lihat K3); unik di semua satuan semua barang, termasuk barang nonaktif dan satuan nonaktif.
- `Dijual per` (tanpa beda huruf & spasi ujung): `kg` → gram ×1000, `ons` → gram ×100, `liter`/`l` → ml ×1000 (curah); lainnya → pcs ×1. `Isi` dan `Batas stok menipis` dihitung dalam satuan eceran.
- Gaya §12b: kartu putih bulat di latar grouped, baris ala Settings, judul bagian 20px tebal. Token global baru (nilai persis, dari mockup): `--color-warning-soft #fff0d9`, `--color-warning-ink #8a4b00`, `--color-danger-soft #fde8e6`, `--color-danger-ink #9b1c12`, `--color-scan-bg #000000`. Tanda status = ikon lucide + teks: `Minus` (CircleMinus, danger-soft/ink), `Menipis` (TriangleAlert, warning-soft/ink), `Sedang langka` (Hourglass), `Tidak diambil lagi` (PackageX), `Stok belum dihitung` (CircleDashed), `Nonaktif` (EyeOff) — empat terakhir netral (`bg-border text-text`).
- Nilai uang di kartu & tile tidak pernah dipotong "…": ukuran huruf turun bertahap (Task 6).
- Tombol ≥ 44px, fokus terlihat, dialog/sheet Radix (`shared/ui/dialog`, `shared/ui/sheet`), label tombol spesifik.
- Commit: conventional, Bahasa Indonesia, tanpa baris `Co-Authored-By` atau jejak alat lain.
- Teks UI (pakai persis; `{…}` diisi; `—` = em dash):

| Kunci | Teks |
|---|---|
| daftar | judul `Barang`; tombol ikon aria `Tambah barang` (+) dan `Menu lainnya` (⋯) berisi `Impor dari Excel`, `Unduh template Excel`; cari placeholder & label `Cari nama atau barcode`; tombol kamera aria `Scan dengan kamera`; chip `Semua {n}` · `{kategori} {n}` · `Nonaktif {n}`; baris `{nama}` / `Stok {qty}` + tanda / `{Rp}/{satuan}`; kosong `Tidak ada barang yang cocok` |
| tanda | `Menipis` · `Minus` · `Sedang langka` · `Tidak diambil lagi` · `Stok belum dihitung` · `Nonaktif` |
| detail | kembali `Barang`, tombol `Ubah`; atas `{kategori} · dijual per {satuan}`; bagian `Harga` · `Stok` · `Barcode` · `Riwayat harga`; baris harga `Eceran · per {satuan}` · `Grosir · beli {n}+ {satuan}` · `{Satuan besar} · isi {n} {satuan}`; keterangan `Modal {Rp} · untung {Rp} ({n}% dari modal)` / tanpa modal `Modal belum diisi`; stok `Stok sekarang` · `Batas menipis` · `HPP rata-rata` `{Rp} /{satuan}` · `Riwayat stok` · `Lihat semua`; mutasi `Terjual {qty}` · `Penjualan dibatalkan {qty}`, keterangan `{waktu} · Kasir {nama}`; barcode keterangan `Eceran · {satuan}` / `{Satuan besar} · isi {n} {satuan}`; riwayat harga `{label}` `{lama} → {baru}`, keterangan `{d Mmm yyyy} · oleh Pemilik` / `{d Mmm yyyy} · lewat Impor Excel`; tidak ada `Barang tidak ditemukan` + `Kembali ke daftar barang` |
| status | baris `Status barang` `{Aktif / Tidak diambil lagi / Nonaktif}`; lembar `Status barang` dengan pilihan `Aktif` · `Tidak diambil lagi` (`Tetap dijual sampai habis, tanpa peringatan menipis`) · `Nonaktif` (`Hilang dari pencarian kasir; riwayat tetap`), tombol `Simpan status`; sakelar `Sedang langka` (`Peringatan stok diam sampai ada barang masuk`) |
| habis | dialog `{nama} habis`, isi `Barang ini tidak diambil lagi. Nonaktifkan agar tidak muncul di kasir, atau biarkan aktif bila ternyata hanya langka.`, tombol `Nonaktifkan` · `Biarkan aktif` |
| hapus | `Hapus barang`; konfirmasi `Hapus {nama}?` / `Barang ini belum pernah terjual dan akan dihapus permanen.` / `Hapus` · `Batal`; sudah terjual: `Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.` |
| form | bar atas `Batal` + judul `Barang baru` / `Ubah barang`; bagian `Barang` (`Nama`, `Kategori`, `Dijual per`; catatan `Satuan terkecil yang dijual kasir. Barang timbang: pilih kg, ons, atau liter.`), `Eceran` (`Barcode`, `Harga modal`, `Harga jual`), `Grosir` + `opsional` (`Beli minimal`, `Harga per {satuan}`), `Satuan besar` + `opsional` (`Satuan`, `Isi`, `Barcode`, `Harga modal`, `Harga jual`, tombol `Hapus satuan besar`), `Batas stok menipis` (`Ingatkan bila stok di bawah`; catatan `Barang muncul di "Perlu perhatian" di Beranda.`); petunjuk `Untung {Rp} ({n}% dari modal) per {satuan}`, satuan besar `… per {besar} · setara {Rp} per {satuan}`; modal eceran terhitung `Dihitung dari modal {besar}: {Rp}`; terkunci `Tidak bisa diubah — barang sudah terjual`; tombol `Simpan` |
| validasi | (= kolom Status template + tambahan spec) `Nama barang belum diisi` · `Ada spasi dobel di nama` · `Nama terlalu panjang (maks. 100 huruf)` · `Nama sama dengan baris lain` · `Nama sudah dipakai barang lain` · `'Dijual per' belum diisi` · `Harga jual belum diisi` · `Harga jual di bawah modal ({Rp})` · `Barcode salah, scan ulang` · `Barcode sudah dipakai barang lain` · `Barcode sudah dipakai: {nama}` · `Grosir: isi 'beli minimal' dan harganya` · `Grosir: beli minimal 2 ke atas` · `Harga grosir harus lebih murah` · `Harga grosir di bawah modal ({Rp})` · `Satuan besar: nama satuan belum diisi` · `Satuan besar sama dengan satuan eceran` · `Satuan besar: isi berapa? (min. 2)` · `Satuan besar: harga jual belum diisi` · `Satuan besar: harga jual di bawah modal ({Rp})` · `Barcode satuan besar salah` · `Barcode satuan besar sudah dipakai` · `Batas stok menipis: isi angka, mis. 20` · `{Kolom}: ketik angka saja, mis. 3500` · `'Dijual per' tidak bisa diubah — barang sudah terjual` · `Isi {besar} tidak bisa diubah — sudah terjual` |
| scan | judul `Scan barcode`, keterangan `Barcode eceran` / `Barcode satuan besar` / `Cari barang`; `Arahkan kamera ke barcode`; aria `Nyalakan senter` / `Matikan senter`; `Ketik manual`; `Batal`; gagal `Kamera tidak bisa dibuka — ketik barcode secara manual` |
| perhatian (baru) | `Harga modal {nama} naik {Rp}` / `Harga modal {nama} turun {Rp}` + `Untung jadi {Rp}`; `{nama} habis` + `Tidak diambil lagi` |
| lembar harga | judul `Harga modal naik` / `Harga modal turun`, keterangan `{nama}`; aria tutup `Tutup`; per blok: label baris harga (seperti detail), `Modal` `{lama} → {baru}` + `{±Rp} · oleh Pemilik, {HH.MM}` / `… · lewat Impor Excel, {HH.MM}`, `Harga jual sekarang`, `Untung` `{a}% → {b}%` + `Turun: {Rp} → {Rp}` / `Naik: {Rp} → {Rp}`, `Harga saran {Rp} · untung tetap {n}%`, `atau ketik harga sendiri`, `untung dihitung otomatis` / `untung {Rp} ({n}% dari modal)`; tombol `Pakai harga ini` (berubah `Simpan harga` bila ada harga diketik) · `Harga tetap` · `Nanti saja` |
| impor | judul `Impor dari Excel`; langkah `Pilih file` · `Periksa` · `Impor`; tombol `Pilih file`; `{nama file}` `{n} baris · {k} KB`, `Ganti file`; ringkasan `{n} baris siap` / `akan diimpor` · `{n} akan diperbarui` / `akan diimpor` · `{n} perlu diperbaiki` / `dilewati`; filter `Semua {n}` · `Perlu diperbaiki {n}`; `Urut sesuai baris di Excel`; kolom `Baris` `Status` `Nama` `Dijual per` `Harga jual` `Satuan besar` `Masalah`; status `Siap` · `Akan diperbarui` · `Sudah ada, tidak berubah` · `Perbaiki`; sel satuan besar `{Besar} isi {n} · {Rp}`, kosong `—`; `Baris bermasalah dilewati — perbaiki di Excel lalu impor ulang`; `Batal` · `Impor {n} barang`; selesai (toast) `{a} barang baru, {b} diperbarui`; galat file `File ini bukan file .xlsx yang bisa dibaca` · `Sheet "Barang" tidak ditemukan — pakai template Excel dari aplikasi` · `File terlalu besar (maks. 5 MB)` · `Tidak ada baris barang di file ini` |
| kasir | scan/kode barang nonaktif → toast `Barang ini tidak dijual lagi` |

## Review Focus

1. **File template asli berisi ±2000 baris yang hanya punya rumus Status (kolom A)** → hanya baris yang benar-benar diisi (B–O) yang dikirim, dihitung, dan ditampilkan; tidak ada ribuan "Nama barang belum diisi". Dites di Task 12 (`toImportRows`) dan Task 5 (server mengabaikan baris yang semua selnya `null`).
2. **Sel Excel bertipe "salah"**: barcode tersimpan sebagai angka (nol depan hilang, `89686010947`, atau `8.99269640444E+12`), harga diketik `3.500`/`Rp3.500`, batas `2,5`, file bukan .xlsx → diterima bila masuk akal, selain itu "Perlu diperbaiki" dengan pesan jelas, tidak pernah crash. Dites di Task 5 dan Task 12.
3. **File yang sama diimpor dua kali** → tidak ada barang dobel; baris yang dulu "Siap" kini "Sudah ada, tidak berubah"; tidak ada notifikasi modal baru. Dites di Task 5.
4. **Modal berubah dua kali, atau kembali ke nilai semula, sebelum pemilik bertindak** → satu butir saja, menampilkan modal saat butir dibuat → terbaru; kembali ke semula → butir hilang. Dites di Task 4.
5. **Barang dinonaktifkan saat sudah ada di keranjang kasir** → penjualan tetap tersimpan (server tidak menolak); hanya cari/scan yang menolak. Dites di Task 3.

## Keputusan pembangun di rencana ini (tinjau)

- **K1 Lembar ubah harga mencakup semua baris harga** (eceran, tier grosir, satuan besar aktif), satu blok per baris persis seperti blok mockup; mockup (satu blok "per pcs") adalah kasus barang satu baris. Alasan: modal hampir selalu dari dus, sehingga harga dus juga harus bisa disesuaikan.
- **K2 Persen untung di mockup form/detail memakai margin** (25%, 20%, 17%); spec mengikat "dari modal", jadi angka di rencana berbeda (33%, 25%, 20%).
- **K3 (diputuskan controller) Barcode 14 digit GTIN-14/ITF-14 DITERIMA** dengan check digit GS1 mod-10 — barcode dus di Indonesia umumnya 14 digit; menolaknya membuat satuan besar tak bisa di-scan. Kolom Status template disesuaikan terpisah.
- **K4 (dikonfirmasi pemilik 2 Nov: orang toko bisa mengosongkan kolom yang tidak ia tahu) Impor: sel kosong tidak menghapus data lama** (kategori, barcode, modal, grosir, satuan besar, batas). Barcode tidak ditemukan + nama sama → "Akan diperbarui" (mengisi/mengganti barcode).
- **K5 (disesuaikan controller) Penanda diam:** `Stok belum dihitung` tidak memicu menipis maupun minus; `Sedang langka` hanya membungkam **menipis** (stok minus = masalah data, tetap muncul); `Tidak diambil lagi` hanya membungkam menipis; `Nonaktif` membungkam keduanya.
- **K6 Kasir:** barcode/kode barang nonaktif atau satuan nonaktif → 410 `PRODUCT_INACTIVE`; penjualan yang sudah di keranjang tetap diterima.
- **K7 Template** di-commit sebagai `web/public/templates/data-barang.xlsx` (kosong, dari generator); `/templates/` dikecualikan dari fallback navigasi SW.
- Teks yang tidak ada di spec/mockup (habis, hapus, status, galat impor/kamera, toast) adalah pilihan rencana; nomor baris impor = nomor baris Excel (data mulai baris 3; mockup menulis 2).

---

### Task 1: Kontrak API barang pemilik, impor, perhatian, dan katalog kasir

**Files:** Modify `api/openapi.yaml`; regenerate `web/src/shared/api/gen/**`; Modify `web/src/shared/api/contract.test.ts`, `web/src/mocks/owner-summary.ts` (isi `costChanges: []`, `stockOuts: []` sementara), fixture `Attention` di `web/src/features/owner/home/home-model.test.ts` & `beranda-page.test.tsx` (tambah dua array kosong), `web/src/shared/lib/error-messages.ts` (+2 pesan).

**Interfaces — Produces** (semua di tag `owner`, `security: ownerCookieAuth`, semua 401 `Unauthorized`):

| Method & path | operationId | Body | Sukses | Error |
|---|---|---|---|---|
| `GET /api/owner/products` | `listOwnerProducts` | — | 200 `OwnerProductRow[]` (semua barang, termasuk nonaktif) | — |
| `POST /api/owner/products` | `createOwnerProduct` | `ProductInput` | 201 `OwnerProduct` | 422 `ProductValidationProblem` |
| `GET /api/owner/products/{productId}` | `getOwnerProduct` | — | 200 `OwnerProduct` | 404 |
| `PUT /api/owner/products/{productId}` | `updateOwnerProduct` | `ProductInput` | 200 `OwnerProduct` | 404, 422 `ProductValidationProblem` |
| `DELETE /api/owner/products/{productId}` | `deleteOwnerProduct` | — | 204 | 404, 409 `PRODUCT_HAS_SALES` |
| `PUT /api/owner/products/{productId}/status` | `setOwnerProductStatus` | `ProductStatusInput` | 200 `OwnerProduct` | 404 |
| `PUT /api/owner/products/{productId}/prices` | `updateOwnerProductPrices` | `PriceUpdate` | 200 `OwnerProduct` | 404, 422 `ProductValidationProblem` |
| `DELETE /api/owner/products/{productId}/cost-alert` | `dismissOwnerCostAlert` | — | 204 (idempoten) | 404 |
| `GET /api/owner/products/{productId}/movements` | `listOwnerProductMovements` | — | 200 `StockMovement[]` terbaru dulu | 404 |
| `GET /api/owner/categories` | `listOwnerCategories` | — | 200 `string[]` | — |
| `POST /api/owner/product-imports/check` | `checkOwnerProductImport` | `ImportRequest` | 200 `ImportCheck` | 422 |
| `POST /api/owner/product-imports` | `commitOwnerProductImport` | `ImportRequest` | 200 `ImportResult` | 422 |

Skema (semua uang `integer`, waktu `integer int64` ms):
- `ErrorCode` + `PRODUCT_INACTIVE`, `PRODUCT_HAS_SALES` (16 nilai).
- `ProductStatus` enum `[aktif, tidak_diambil, nonaktif]`; `StockAlert` enum `[none, menipis, minus]` (deskripsi = aturan K5); `PriceSource` enum `[pemilik, impor]`.
- `ProductCost {amount ≥ 0, qtyBase ≥ 1}` — "HPP: amount rupiah per qtyBase satuan dasar".
- `OwnerProductUnit` = field `ProductUnit` + `cost: integer, nullable` (modal satuan ini) + `active: boolean` + `sold: boolean`.
- `OwnerProductRow {id, name, storeCode, category (nullable), status, scarce, stockCounted, isCurah, baseUnit, unitName, unitSize, price, barcodes: string[] (semua satuan), stock, stockAlert}` — `unitName/unitSize/price` = satuan eceran.
- `OwnerProduct {id, name, storeCode, category (nullable), status, scarce, stockCounted, isCurah, baseUnit, units: OwnerProductUnit[] (units[0] = eceran), cost: ProductCost (nullable), stock, minStock (integer qtyBase, nullable), stockAlert, hasSales, costAlert: CostAlert (nullable), recentMovements: StockMovement[] (maxItems 5), priceHistory: PriceHistoryEntry[] (terbaru dulu)}`.
- `CostAlert {fromCost: ProductCost, changedAt, source: PriceSource}`.
- `StockMovement {id, at, kind: enum [jual, batal], qtyBase (bertanda: jual negatif), kasirName}`.
- `PriceHistoryEntry {id, at, unitId, unitName, isEceran, unitSize, tierMinQty (nullable), oldPrice (nullable = baru ditambah), newPrice (nullable = dihapus), source: PriceSource}`.
- `ProductInput {name (1–100), category (nullable), sellUnit (1–20), barcode (nullable), cost (nullable, ≥ 0), price (≥ 1), tier: WholesaleTier (nullable), bigUnit: BigUnitInput (nullable), minStock: number (nullable, satuan eceran)}`; `BigUnitInput {unitId (nullable; satuan besar yang diubah), name, size (integer ≥ 2, satuan eceran), barcode (nullable), cost (nullable), price (≥ 1)}`.
- `ProductStatusInput {status, scarce}`; `PriceUpdate {lines: PriceLineInput[] (minItems 1)}`; `PriceLineInput {unitId, tierMinQty (nullable), price ≥ 1}`.
- `ProductField` enum `[name, category, sellUnit, barcode, cost, price, tierMinQty, tierPrice, bigName, bigSize, bigBarcode, bigCost, bigPrice, minStock]`; `FieldError {field, message}`; `ProductValidationProblem` = `Problem` + `{code: [VALIDATION], errors: FieldError[]}`.
- `ImportRow {row (integer ≥ 3, nomor baris Excel), name, category, sellUnit, barcode, cost, price, tierMinQty, tierPrice, bigName, bigSize, bigBarcode, bigCost, bigPrice, minStock}` — semua selain `row` `string, nullable` (teks sel B–O yang di-trim; `null` = kosong). `ImportRequest {rows: ImportRow[] (1–5000)}`.
- `ImportRowStatus` enum `[baru, diperbarui, tidak_berubah, perbaiki]`; `ImportRowResult {row, status, problems: string[], changes: string[], notes: string[]}`; `ImportSummary {ready, update, unchanged, invalid}`; `ImportCheck {rows: ImportRowResult[], summary}`; `ImportResult {created, updated, skipped}`.
- `Attention` + wajib `costChanges: CostChangeItem[]` (terbaru dulu) dan `stockOuts: StockOutItem[]` (urut nama); `CostChangeItem {productId, productName, unitName, oldCost, newCost, price, changedAt, source}` (modal satuan eceran saat butir dibuat → sekarang; `price` = harga eceran sekarang); `StockOutItem {productId, productName}`. Deskripsi `lowStockCount`/`negativeStockCount` memuat aturan K5.
- `GET /api/catalog/lookup` + respons `410` (`PRODUCT_INACTIVE`, "barang/satuan nonaktif"); deskripsi `searchCatalog`/`listQuickCurah`: "tanpa barang nonaktif dan satuan nonaktif". Deskripsi `info`: tambahkan "kategori, status, stok, dan modal hanya di /api/owner".
- `error-messages.ts`: `PRODUCT_INACTIVE: "Barang ini tidak dijual lagi"`, `PRODUCT_HAS_SALES: "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif."`.

- [ ] **Step 1: Tulis test yang gagal** (`contract.test.ts`)

```ts
test("ErrorCode 16 nilai termasuk PRODUCT_INACTIVE dan PRODUCT_HAS_SALES", () => {
  expect(Object.values(ErrorCode)).toHaveLength(16);
  expect(Object.values(ErrorCode)).toEqual(expect.arrayContaining(["PRODUCT_INACTIVE", "PRODUCT_HAS_SALES"]));
});
test("Product kasir tanpa field pemilik; OwnerProductUnit punya cost", () => {
  expectTypeOf<keyof Product>().toEqualTypeOf<"id" | "name" | "storeCode" | "isCurah" | "baseUnit" | "units">();
  expectTypeOf<OwnerProductUnit["cost"]>().toEqualTypeOf<number | null>();
});
test("CreateOwnerProductBody menolak price 0 dan menerima contoh Teh Pucuk", () => {
  const teh = { name: "Teh Pucuk Harum 350 ml", category: "Minuman", sellUnit: "botol", barcode: "8996001600269",
    cost: 3000, price: 4000, tier: { minQty: 12, price: 3750 },
    bigUnit: { unitId: null, name: "dus", size: 24, barcode: null, cost: 70000, price: 84000 }, minStock: 24 };
  expect(CreateOwnerProductBody.safeParse(teh).success).toBe(true);
  expect(CreateOwnerProductBody.safeParse({ ...teh, price: 0 }).success).toBe(false);
});
test("CheckOwnerProductImportBody menolak rows kosong; menerima baris semua null", () => {
  expect(CheckOwnerProductImportBody.safeParse({ rows: [] }).success).toBe(false);
  expect(CheckOwnerProductImportBody.safeParse({ rows: [{ row: 3, name: null, /* … semua null */ }] }).success).toBe(true);
});
test("Attention memuat costChanges dan stockOuts", () => {
  expectTypeOf<Attention["costChanges"]>().toEqualTypeOf<CostChangeItem[]>();
  expectTypeOf<Attention["stockOuts"]>().toEqualTypeOf<StockOutItem[]>();
});
```
- [ ] **Step 2:** `npx vitest run src/shared/api/contract.test.ts` → FAIL (impor/tipe belum ada).
- [ ] **Step 3:** tulis kontrak; `npm run gen`; isi `costChanges: []`/`stockOuts: []` di `ownerTodaySummary` & fixture Attention; tambah 2 pesan error.
- [ ] **Step 4:** `npm run gen:check && npm run typecheck && npm test` → hijau.
- [ ] **Step 5:** commit `feat(api): kontrak barang pemilik, impor Excel, dan barang nonaktif di kasir`.

---

### Task 2: Aturan barang bersama (murni)

**Files:** Create `web/src/shared/lib/product-rules.ts`, `product-rules.test.ts`; Modify `web/src/shared/lib/quantity.ts` (+ `formatQty`), `quantity.test.ts`.

**Interfaces — Consumes:** `ProductCost`, `ProductField` (gen), `roundHalfUp`, `formatRupiah`. **Produces:**
```ts
export type ProductDraft = {
  name: string | null; category: string | null; sellUnit: string | null; barcode: string | null;
  cost: number | null; price: number | null; tierMinQty: number | null; tierPrice: number | null;
  bigName: string | null; bigSize: number | null; bigBarcode: string | null;
  bigCost: number | null; bigPrice: number | null; minStock: number | null; // minStock & bigSize: satuan eceran
};                                      // `satisfies Record<ProductField, unknown>` dicek di test
export type RuleProblem = { field: ProductField; message: string };
export type SellUnitKind = { baseUnit: "pcs" | "gram" | "ml"; isCurah: boolean; unitSize: number };
export function sellUnitKind(sellUnit: string): SellUnitKind | null;          // "" → null
export function isValidBarcode(code: string): boolean;
export function hppFromDraft(d: ProductDraft): ProductCost | null;
export function unitCost(cost: ProductCost | null, unitSize: number): number | null;
export function markup(price: number, cost: number | null): { profit: number; percent: number | null } | null; // cost null → null
export function suggestedPrice(price: number, oldCost: number, newCost: number): number | null;             // oldCost 0 → null
export function validateDraft(d: ProductDraft): RuleProblem[];   // urutan = urutan aturan di bawah
export function formatQty(qtyBase: number, unitSize: number, unitName: string): string; // quantity.ts
```
`validateDraft` — aturan berurutan (modal efektif eceran `m = unitCost(hppFromDraft(d), size)`, modal efektif besar `M = unitCost(hpp, bigSize × size)`, `bigAny` = salah satu field big* terisi): nama kosong · spasi dobel di dalam nama (`/\s{2,}/`) · nama > 100 · `sellUnit` kosong · `price` kosong atau < 1 · `price < m` · barcode tidak valid · `barcode === bigBarcode` (field `bigBarcode`, `Barcode satuan besar sudah dipakai`) · tier tidak lengkap · `tierMinQty < 2` · `tierPrice >= price` · `tierPrice < m` · `bigAny` tanpa nama · `bigName` = `sellUnit` (tanpa beda huruf) · `bigAny` dan `bigSize` kosong/bukan bulat/< 2 · `bigAny` tanpa `bigPrice` · `bigPrice < M` · bigBarcode tidak valid · `minStock < 0` atau `minStock × unitSize` bukan bilangan bulat. Pesan persis dari tabel teks UI. `unitSize` eceran untuk modal efektif/batas = `sellUnitKind(sellUnit)?.unitSize ?? 1` (`sellUnit` kosong → 1).

`suggestedPrice` (tidak ditentukan test saja — pakai persis):
```ts
const n = newCost * price, d = oldCost * 500;      // dicek Number.isSafeInteger, lempar RangeError bila tidak
return Math.ceil(n / d) * 500;                     // koreksi floating seperti roundHalfUp: pastikan q*d >= n > (q-1)*d
```

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([["kg", "gram", 1000], [" KG ", "gram", 1000], ["ons", "gram", 100], ["liter", "ml", 1000], ["L", "ml", 1000], ["botol", "pcs", 1]])(
  "sellUnitKind(%s)", (s, base, size) => expect(sellUnitKind(s)).toEqual({ baseUnit: base, isCurah: base !== "pcs", unitSize: size }));
test.each([["089686010947", true], ["8992696404441", true], ["8992696404442", false], ["96385074", true],
  ["18992628022191", true], ["18992628022192", false], ["89686010947", false], ["8.99269640444E+12", false], ["12345", false]])("isValidBarcode(%s) = %s", …);
test("hppFromDraft: modal besar menang; eceran; curah; kosong", () => {
  expect(hppFromDraft(draft({ sellUnit: "botol", cost: 3000, bigName: "dus", bigSize: 24, bigCost: 70000, bigPrice: 84000 }))).toEqual({ amount: 70000, qtyBase: 24 });
  expect(hppFromDraft(draft({ sellUnit: "botol", cost: 3000 }))).toEqual({ amount: 3000, qtyBase: 1 });
  expect(hppFromDraft(draft({ sellUnit: "kg", bigName: "karung", bigSize: 25, bigCost: 300000, bigPrice: 340000 }))).toEqual({ amount: 300000, qtyBase: 25000 });
  expect(hppFromDraft(draft({ sellUnit: "botol" }))).toBeNull();
});
test("unitCost membulatkan setengah ke atas", () => {
  expect(unitCost({ amount: 70000, qtyBase: 24 }, 1)).toBe(2917);
  expect(unitCost({ amount: 104000, qtyBase: 40 }, 1)).toBe(2600);
  expect(unitCost({ amount: 16500, qtyBase: 1000 }, 1000)).toBe(16500);
});
test.each([[36000, 34000, 2000, 6], [35500, 34000, 1500, 4], [212000, 201000, 11000, 5], [36000, 36000, 0, 0], [33000, 34000, -1000, -3]])(
  "markup(%i, %i)", (p, c, profit, percent) => expect(markup(p, c)).toEqual({ profit, percent }));
test("markup modal 0 → tanpa persen; modal null → null", () => {
  expect(markup(1000, 0)).toEqual({ profit: 1000, percent: null }); expect(markup(1000, null)).toBeNull(); });
test.each([[36000, 34000, 36000, 38500], [3100, 2600, 2700, 3500], [2800, 2600, 2700, 3000], [112000, 104000, 108000, 116500],
  [18000, 16500, 17000, 19000], [36000, 36000, 34000, 34000]])("suggestedPrice(%i, %i → %i) = %i", …);
test("suggestedPrice modal lama 0 → null", () => expect(suggestedPrice(1000, 0, 500)).toBeNull());
test.each([
  [{ name: null }, "name", "Nama barang belum diisi"],
  [{ name: "Indomie  Goreng" }, "name", "Ada spasi dobel di nama"],
  [{ sellUnit: null }, "sellUnit", "'Dijual per' belum diisi"],
  [{ price: null }, "price", "Harga jual belum diisi"],
  [{ cost: 34000, price: 33000 }, "price", "Harga jual di bawah modal (Rp34.000)"],
  [{ barcode: "89686010947" }, "barcode", "Barcode salah, scan ulang"],
  [{ tierMinQty: 10 }, "tierMinQty", "Grosir: isi 'beli minimal' dan harganya"],
  [{ tierMinQty: 1, tierPrice: 3000 }, "tierMinQty", "Grosir: beli minimal 2 ke atas"],
  [{ price: 11500, tierMinQty: 12, tierPrice: 11800 }, "tierPrice", "Harga grosir harus lebih murah"],
  [{ cost: 3000, price: 4000, tierMinQty: 12, tierPrice: 2900 }, "tierPrice", "Harga grosir di bawah modal (Rp3.000)"],
  [{ bigSize: 24, bigPrice: 84000 }, "bigName", "Satuan besar: nama satuan belum diisi"],
  [{ sellUnit: "pcs", bigName: "PCS", bigSize: 10, bigPrice: 1 }, "bigName", "Satuan besar sama dengan satuan eceran"],
  [{ bigName: "dus", bigSize: 1, bigPrice: 84000 }, "bigSize", "Satuan besar: isi berapa? (min. 2)"],
  [{ bigName: "dus", bigSize: 24 }, "bigPrice", "Satuan besar: harga jual belum diisi"],
  [{ cost: 3000, bigName: "dus", bigSize: 24, bigPrice: 70000 }, "bigPrice", "Satuan besar: harga jual di bawah modal (Rp72.000)"],
  [{ bigName: "dus", bigSize: 24, bigPrice: 84000, bigBarcode: "123" }, "bigBarcode", "Barcode satuan besar salah"],
  [{ barcode: "8996001600269", bigName: "dus", bigSize: 24, bigPrice: 84000, bigBarcode: "8996001600269" }, "bigBarcode", "Barcode satuan besar sudah dipakai"],
  [{ sellUnit: "pcs", minStock: 2.5 }, "minStock", "Batas stok menipis: isi angka, mis. 20"],
])("validateDraft %o → %s: %s", (patch, field, message) => expect(validateDraft(draft(patch))).toContainEqual({ field, message }));
test("draft lengkap Teh Pucuk valid; kg dengan batas 2,5 valid", () => {
  expect(validateDraft(TEH_PUCUK_DRAFT)).toEqual([]);
  expect(validateDraft(draft({ sellUnit: "kg", minStock: 2.5 }))).toEqual([]);
});
test.each([[86500, 1000, "kg", "86,5 kg"], [-2500, 1000, "kg", "−2,5 kg"], [4, 1, "pcs", "4 pcs"], [2500, 100, "ons", "25 ons"]])("formatQty", …);
```
(`draft(patch)` = draft valid minimal `{name:"Barang Uji", sellUnit:"pcs", price:1000, …null}` ditimpa `patch`; minus pada `formatQty` memakai U+2212 seperti mockup.)
- [ ] **Step 2:** `npx vitest run src/shared/lib` → FAIL. **Step 3:** implementasi. **Step 4:** PASS. **Step 5:** commit `feat(lib): aturan barang bersama untuk form dan impor`.

---

### Task 3: State palsu v4, seed barang, dan katalog kasir tanpa barang nonaktif

**Files:** Modify `web/src/mocks/db.ts`, `seed-data.ts`, `seed-catalog-names.ts` (+ `category`), `sale-rules.ts` (`saleCost`), `history.ts`, `handlers/sales.ts` (`voidedAt`, `saleCost`), `handlers/catalog.ts`; Create `web/src/mocks/products/views.ts`; Tests `db.test.ts`, `seed-data.test.ts`, `history.test.ts`, `handlers/sales-ledger.test.ts`, `handlers/catalog.test.ts`, `web/src/features/kasir/scan/scan-box.test.tsx` (atau `kasir-screen.test.tsx`).

**Interfaces — Consumes:** Task 1 tipe, Task 2 `isValidBarcode`, `unitCost`. **Produces:**
```ts
// db.ts
export type MockUnit = ProductUnit & { active: boolean };
export type MockProduct = Omit<Product, "units"> & { units: MockUnit[]; category: string | null;
  status: ProductStatus; scarce: boolean; stockCounted: boolean; cost: ProductCost | null };
export type MockCostAlert = CostAlert;                  // per productId
export type MockSale = Sale & { costTotal: number; voidedAt: number | null };
MockState: version: 4; products: MockProduct[]; categories: string[]; priceHistory: (PriceHistoryEntry & { productId: string })[];
           costAlerts: Record<string, MockCostAlert>;   // unitCosts DIHAPUS; minStock tetap (key tidak ada = null)
// sale-rules.ts
export const saleCost = (products: readonly MockProduct[], items: readonly SaleItem[]): number; // Σ roundHalfUp(cost.amount × qtyBase, cost.qtyBase); cost null → 0
// products/views.ts
export function eceranOf(p: MockProduct): MockUnit;                // units[0]
export function toKasirProduct(p: MockProduct): Product;           // field kasir saja; satuan active=false dibuang
export function productOfUnit(state: Readonly<MockState>, unitId: string): MockProduct | undefined;
```
- Seed: `categories` = 20 kategori template persis (`Beras`, `Minyak Goreng`, `Gula & Tepung`, `Telur`, `Mi Instan`, `Bumbu Dapur`, `Kopi & Teh`, `Susu`, `Minuman`, `Makanan Ringan`, `Roti & Biskuit`, `Makanan Kaleng`, `Sabun & Deterjen`, `Perawatan Diri`, `Kebutuhan Bayi`, `Rokok`, `Gas & Air Galon`, `Obat Ringan`, `Alat Tulis`, `Lain-lain`). Kategori per grup `CATALOG_NAMES`: beras→Beras, minyak→Minyak Goreng, gula→Gula & Tepung, mie→Mi Instan, kopi/teh→Kopi & Teh, susu→Susu, bumbu→Bumbu Dapur, sabun→Sabun & Deterjen, minuman→Minuman. Fixture: Indomie→Mi Instan, Beras Pandan Wangi 5 kg→Beras, Bimoli→Minyak Goreng, Kapal Api→Kopi & Teh, Gula Pasir & Tepung Terigu→Gula & Tepung, Beras→Beras, Telur Ayam→Telur, Minyak Goreng→Minyak Goreng.
- Seed `cost`: Gula Pasir (2001) `{16500, 1000}`, Beras Pandan Wangi (1002) `{71000, 1}`, Indomie (1001) `{104000, 40}` (modal dari dus); lainnya `{costFromPrice(units[0].price), units[0].unitSize}` (satu `rand()` per barang). Semua barang `status: "aktif"`, `scarce: false`, `stockCounted: true`, semua satuan `active: true`.
- Barcode buatan: 12 digit `899` + `tail.padStart(9, "0")` + check digit EAN-13 (tetap unik).
- Kasir (`handlers/catalog.ts`): lookup barcode/kode milik barang `nonaktif` atau satuan `active: false` → `problem(410, "PRODUCT_INACTIVE", "Barang ini tidak dijual lagi")`; search & quick-curah membuang barang nonaktif; semua respons memakai `toKasirProduct`. `createSale` **tidak** menolak satuan barang nonaktif.
- `applyVoid` mengisi `voidedAt = Date.now()`; `toPublicSale` membuang `costTotal` dan `voidedAt`.
- UI kasir tidak perlu kode baru: `resolve-code.ts` sudah memakai `pesanError` untuk kode selain `NOT_FOUND`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("state v3 di localStorage → reseed v4", () => {});
test("seed: 20 kategori template; setiap barang berkategori dari daftar; semua barcode valid & unik", () => {});
test("HPP per barang: fixture persis; lainnya 85–93% harga satuan pertama kelipatan Rp50", () => {
  expect(cost("2001")).toEqual({ amount: 16500, qtyBase: 1000 });
  expect(cost("1002")).toEqual({ amount: 71000, qtyBase: 1 });
  expect(cost("1001")).toEqual({ amount: 104000, qtyBase: 40 });
});
test("costTotal penjualan contoh = Σ HPP item; batal tidak mengubahnya", async () => {
  // gula 1500 g 24.750 · gula Rp20.000 (1111 g) 18.332 · beras 71.000 · Indomie dus 104.000 · Indomie 3 pcs 7.800
  expect(costOfStored(sale.id)).toBe(225882);
  // setelah batal: { status: "dibatalkan", costTotal: 225882 }, voidedAt angka, respons kasir tanpa voidedAt
});
test("respons katalog kasir hanya field kasir; satuan nonaktif dibuang", async () => {
  // keys(product) = [baseUnit,id,isCurah,name,storeCode,units]; keys(unit) = [barcodes,id,name,price,productId,unitSize,wholesaleTiers]
  // dus Indomie active=false → lookup 189686010944 → 410 PRODUCT_INACTIVE; search "indomie" → units hanya pcs
});
test("barang nonaktif: lookup barcode & kode toko → 410 PRODUCT_INACTIVE; search & quick-curah tidak memuatnya", async () => {});
test("barang dinonaktifkan setelah masuk keranjang → createSale tetap 201", async () => {});
```
UI (`scan-box.test.tsx`): Bimoli `nonaktif` lalu scan `8992696404441` → toast `Barang ini tidak dijual lagi`, `beep("error")`, keranjang kosong.
- [ ] **Step 2:** RED. **Step 3:** implementasi (perbarui test F2/F3a yang membaca `unitCosts` → `cost`; jumlah 7 barang menipis tetap). **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): state v4 dengan HPP per barang, kategori, dan barang nonaktif di kasir`.

---

### Task 4: Handler barang pemilik & "Perlu perhatian" diperluas

**Files:** Create `web/src/mocks/products/drafts.ts`, `products/apply.ts`, `products/prices.ts`, `handlers/owner-products.ts`; Modify `products/views.ts`, `handlers/index.ts`, `owner-summary.ts`; Tests `products/apply.test.ts`, `handlers/owner-products.test.ts`, `owner-summary.test.ts`.

**Interfaces — Consumes:** Task 2, Task 3. **Produces:**
```ts
// views.ts
export function stockAlertOf(state: Readonly<MockState>, p: MockProduct): StockAlert;      // aturan K5
export function soldUnitIds(state: Readonly<MockState>): Set<string>;                    // semua sale (selesai & batal)
export function movementsOf(state: Readonly<MockState>, productId: string): StockMovement[]; // dari sales: jual @createdAt, batal @voidedAt; id `${saleId}:jual|batal`
export function toOwnerRow(state: Readonly<MockState>, p: MockProduct): OwnerProductRow;
export function toOwnerProduct(state: Readonly<MockState>, p: MockProduct): OwnerProduct;
// drafts.ts
export function draftFromInput(input: ProductInput): ProductDraft;
export function draftFromProduct(state: Readonly<MockState>, p: MockProduct): ProductDraft; // satuan besar = satuan aktif pertama setelah eceran; cost di bigCost bila cost.qtyBase = unitSize besar, selain itu di cost
// apply.ts
export type ApplyOptions = { mode: "replace" | "merge"; source: PriceSource; now: number };
export type ApplyOk = { ok: true; product: MockProduct; isNew: boolean; changes: string[]; notes: string[];
  priceEntries: PriceHistoryEntry[]; costChanged: boolean };
export type ApplyResult = ApplyOk | { ok: false; errors: FieldError[] };
export function applyDraft(state: Readonly<MockState>, target: MockProduct | null, draft: ProductDraft, opts: ApplyOptions): ApplyResult; // tidak memutasi
export function saveApplied(state: MockState, result: ApplyOk, opts: ApplyOptions): void;   // memutasi: produk, kategori baru, riwayat harga, peringatan modal
// prices.ts
export function applyPriceLines(state: Readonly<MockState>, p: MockProduct, lines: PriceLineInput[], now: number): ApplyResult;
```
Aturan `applyDraft` (`replace` = form: field kosong menghapus; `merge` = impor: field kosong mempertahankan nilai lama — K4):
1. Draft efektif = `merge ? isi null dari draftFromProduct(target) : draft`; `validateDraft` → error.
2. Unik: nama (trim, tanpa beda huruf) vs barang lain → `name` `Nama sudah dipakai barang lain`; setiap barcode draft vs semua satuan barang lain (termasuk nonaktif) → `barcode`/`bigBarcode` `Barcode sudah dipakai: {nama}`.
3. Kunci (target ada & satuan eceran terjual): `sellUnitKind` berbeda `baseUnit`/`unitSize` → `sellUnit` `'Dijual per' tidak bisa diubah — barang sudah terjual`; satuan besar yang sama (`bigUnit.unitId` di form; nama sama tanpa beda huruf di impor) terjual & `isi` berubah → `bigSize` `Isi {nama} tidak bisa diubah — sudah terjual`.
4. Satuan besar diganti/dihapus: lama terjual → `active: false`; belum terjual → dibuang. Baru → `newId()`.
5. `cost = hppFromDraft(efektif)`; `minStock = minStock × unitSize eceran` (null bila kosong); barang baru: `storeCode` = maks numerik + 1 (seed: maks `2005` → `"2006"`), `stock: 0`, `stockCounted: false`, `status: "aktif"`, `scarce: false`; kategori baru ditambah ke akhir `state.categories`.
6. `priceEntries`: selisih harga per kunci `(unitId, tierMinQty)` antara target dan hasil (berubah/ditambah/dihapus); barang baru → tanpa entri.
7. Peringatan modal (hanya target ada & `target.cost` tidak null & rasio berubah): tidak ada peringatan → buat `{fromCost: target.cost, changedAt: now, source}`; ada → perbarui `changedAt/source`, `fromCost` tetap; rasio baru = `fromCost` → hapus peringatan.
8. `changes` (urut): `Kategori {lama|—} → {baru}`, `Dijual per …`, `Barcode …`, `Harga modal {Rp} → {Rp}` (modal eceran), `Harga jual …`, `Grosir {beli n · Rp|—} → …`, `Satuan besar {nama isi n · Rp|—} → …`, `Barcode {besar} …`, `Batas stok menipis {qty|—} → {qty}`; `notes`: `Modal eceran diabaikan — memakai modal satuan besar` bila keduanya terisi, `Kategori baru: {nama}`.

Handler (`withScenario`, `requireOwnerSession` dulu): daftar urut nama (`localeCompare "id"`); `PUT …/status` mengganti `status`/`scarce`; `PUT …/prices` → `applyPriceLines` (draft dari produk dengan harga baris diganti, `validateDraft` + field `price`/`tierPrice`/`bigPrice`; tier yang tidak ada → `tierPrice` `Grosir tidak ditemukan`) lalu simpan + hapus peringatan modal; `DELETE …/cost-alert` menghapus peringatan; `DELETE` barang: punya penjualan → 409 `PRODUCT_HAS_SALES`. `ownerTodaySummary.attention`: `lowStockCount`/`negativeStockCount` lewat `stockAlertOf`; `costChanges` dari `costAlerts` (hanya bila modal eceran lama ≠ baru); `stockOuts` = `tidak_diambil` & `stockCounted` & stok ≤ 0.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("tanpa sesi pemilik → 401 untuk semua endpoint barang", async () => {});
test("daftar: 60 baris; Indomie = {unitName:'pcs', unitSize:1, price:3100, barcodes:['089686010947','189686010944'], category:'Mi Instan', stockAlert:'none'}; tanpa key cost", async () => {});
test("detail Indomie: units[0].cost 2600, units[1].cost 104000, cost {104000,40}, minStock 10", async () => {});
test("tambah Teh Pucuk → 201, storeCode '2006', stok 0 belum dihitung, cost {70000,24}, units[0].cost 2917, tier 12/3750, dus 24 Rp84.000", async () => {});
test("tambah curah kg batas 2,5 → baseUnit gram, unitSize 1000, minStock 2500", async () => {});
test("tambah dengan barcode 089686010947 → 422 [{field:'barcode', message:'Barcode sudah dipakai: Indomie Goreng'}]; nama ' indomie goreng ' → name 'Nama sudah dipakai barang lain'", async () => {});
test("ubah barang terjual: Dijual per kg → 422 sellUnit terkunci; isi dus 24 → 422 bigSize 'Isi dus tidak bisa diubah — sudah terjual'", async () => {});
test("hapus satuan besar terjual → active false (kasir tidak melihatnya); belum terjual → dibuang", async () => {});
test("modal naik dua kali lalu kembali: satu butir 2600→2700, lalu 2600→2750, lalu hilang", async () => {
  // PUT Indomie bigUnit.cost 108000 → costChanges [{productName:'Indomie Goreng', unitName:'pcs', oldCost:2600, newCost:2700, price:3100, source:'pemilik'}]
  // PUT 110000 → satu butir, oldCost 2600, newCost 2750 ; PUT 104000 → costChanges []
});
test("barang baru tidak memicu butir modal", async () => {});
test("PUT prices pcs 3500 → harga berubah, priceHistory[0] {unitName:'pcs', isEceran:true, tierMinQty:null, oldPrice:3100, newPrice:3500, source:'pemilik'}, butir modal hilang", async () => {});
test("PUT prices di bawah modal → 422 [{field:'price', message:'Harga jual di bawah modal (Rp2.600)'}]", async () => {});
test("DELETE cost-alert → 204, butir hilang, harga tetap", async () => {});
test("status: nonaktif & langka; stockOuts untuk tidak_diambil stok 0; aturan K5 pada lowStockCount/negativeStockCount", async () => {
  // seed: lowStockCount 7 → satu barang menipis diberi scarce → 6; tidak_diambil menipis → 5; stockCounted false & stok −3 → tidak minus
});
test("hapus: barang baru tanpa penjualan → 204; Indomie setelah terjual → 409 PRODUCT_HAS_SALES", async () => {});
test("mutasi: Rina jual 2 Indomie lalu batal → movements[0] {kind:'batal', qtyBase:2, kasirName:'Rina'}, [1] {kind:'jual', qtyBase:-2}; recentMovements ≤ 5", async () => {});
test("kategori: 20 template; setelah tambah barang kategori 'Frozen Food' → ada di akhir", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): endpoint barang pemilik, harga, status, dan perhatian modal`.

---

### Task 5: Impor di server palsu — Periksa & Impor

**Files:** Create `web/src/mocks/products/import.ts`, `products/import.test.ts`, `web/src/test/import-rows.ts` (konstanta `IMPORT_ROWS` = isi fixture Task 12); Modify `handlers/owner-products.ts`.

**Interfaces — Consumes:** Task 4 `applyDraft`, `saveApplied`, `draftFromProduct`. **Produces:**
```ts
export function draftFromImportRow(row: ImportRow): { draft: ProductDraft; problems: string[] }; // parse sel
export function checkImport(state: Readonly<MockState>, rows: ImportRow[], now: number): { check: ImportCheck; plans: Map<number, ApplyOk> };
export function commitImport(state: MockState, rows: ImportRow[], now: number): ImportResult;     // memvalidasi ulang; atomik
export const IMPORT_ROWS: ImportRow[];   // web/src/test/import-rows.ts
```
Parse sel: uang `parseRupiah` atau `/^\d+\.0+$/` → bulat, selain itu `{Kolom}: ketik angka saja, mis. 3500` (kolom: `Harga modal`, `Harga jual`, `Harga grosir`, `Harga modal satuan besar`, `Harga jual satuan besar`); `tierMinQty`/`bigSize` bulat; `minStock` desimal `.`/`,`; teks di-trim, `""` → `null`. Baris yang semua field `null` diabaikan (tidak masuk `rows` hasil/ringkasan). > 5000 baris → 422 `VALIDATION`.

Pencocokan (pakai persis):
```ts
const key = (s: string) => s.trim().toLowerCase();
// 1. Dobel di file: baris dengan key(nama) sama → semua "Nama sama dengan baris lain";
//    barcode muncul > 1 kali di kolom E∪L file → baris itu "Barcode sudah dipakai barang lain" (E) / "Barcode satuan besar sudah dipakai" (L).
// 2. Target: owners = barang yang memiliki salah satu barcode baris (semua satuan, termasuk nonaktif).
//    owners.size > 1                       → perbaiki "Barcode sudah dipakai: {nama pertama yang bukan bernama sama}"
//    owners = {p} && key(p.name) === key(n) → target p
//    owners = {p} && nama beda              → perbaiki "Barcode sudah dipakai: {p.name}"
//    owners kosong                          → target = barang dengan key nama sama, atau null (baru)
// 3. applyDraft(state, target, draft, { mode: "merge", source: "impor", now }) → error → perbaiki (pesan error berurutan, setelah problems parse);
//    target null → "baru"; changes.length > 0 → "diperbarui"; selain itu "tidak_berubah".
// 4. Baris diproses berurutan; barcode/nama dari baris "baru"/"diperbarui" sebelumnya ikut dicek unik terhadap baris berikutnya
//    (dobel di file sudah tertangkap di langkah 1, jadi ini hanya pengaman).
```
`summary`: `ready` = baru, `update` = diperbarui, `unchanged` = tidak_berubah, `invalid` = perbaiki. `commitImport` menyimpan baru & diperbarui lewat `saveApplied` (riwayat harga `impor`, peringatan modal `impor`, kategori baru); `skipped` = sisanya.

`IMPORT_ROWS` (11 baris; baris Excel 9 kosong):
| row | isi | hasil |
|---|---|---|
| 3 | `Teh Kotak Jasmine 300 ml`, Minuman, botol, `8996001600269`, 3000, 4000, –, –, dus, 24, –, 70000, 84000, 24 | baru, notes `["Modal eceran diabaikan — memakai modal satuan besar"]` |
| 4 | `Gula Pasir`, Gula & Tepung, kg, –, 17000, 18000, …, batas 10 | diperbarui, changes `["Harga modal Rp16.500 → Rp17.000"]` |
| 5 | `Minyak Goreng Bimoli 2 L`, Minyak Goreng, pcs, `8992696404441`, 34000, 33000 | perbaiki `["Harga jual di bawah modal (Rp34.000)"]` |
| 6 | `Mie Sedaap Goreng 90 g`, Mi Instan, pcs, `089686010947`, 2700, 3300 | perbaiki `["Barcode sudah dipakai: Indomie Goreng"]` |
| 7 | `Beras Pandan Wangi curah`, Beras, –, –, 12000, 14000 | perbaiki `["'Dijual per' belum diisi"]` |
| 8 | `Kopi Kapal Api 165 g`, Kopi & Teh, pcs, `8991002105126`, –, 14500, …, batas 10 | tidak_berubah |
| 10 | `Gas Elpiji 3 kg`, Gas & Air Galon, buah, –, 19000, 22000, …, batas 5 | baru |
| 11 | `Kecap Bango 220 ml`, Bumbu Dapur, pcs, –, 10000, 11500, 12, 11800 | perbaiki `["Harga grosir harus lebih murah"]` |
| 12, 13 | `Sabun Batang Giv 72 g` ×2, Sabun & Deterjen, pcs, –, 2500, 3000 | perbaiki `["Nama sama dengan baris lain"]` (keduanya) |
| 14 | `Beras Cianjur`, Beras Lokal, kg, –, 12500, 14000, –, –, karung, 25, –, 300000, 340000, 50 | baru, notes `["Modal eceran diabaikan — memakai modal satuan besar", "Kategori baru: Beras Lokal"]` |

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("Periksa IMPORT_ROWS → summary {ready:3, update:1, unchanged:1, invalid:6} dan status/masalah per baris sesuai tabel", async () => {});
test("Periksa tidak mengubah state (kategori, barang, peringatan)", async () => {});
test("Impor → {created:3, updated:1, skipped:7}; Gula cost {17000,1000}; costChanges memuat Gula 16500→17000 source 'impor'; Teh Kotak stok 0 stockCounted false; Beras Cianjur cost {300000,25000}", async () => {});
test("impor file yang sama lagi → semua baris lama 'tidak_berubah'; {created:0, updated:0, skipped:11}; tetap satu butir modal Gula", async () => {});
test("baris semua null diabaikan; 5001 baris → 422", async () => {});
test.each([
  [{ price: "Rp3.500" }, null], [{ price: "3500.0" }, null], [{ price: "3500.5" }, "Harga jual: ketik angka saja, mis. 3500"],
  [{ barcode: "89686010947" }, "Barcode salah, scan ulang"], [{ barcode: "8.99269640444E+12" }, "Barcode salah, scan ulang"],
  [{ sellUnit: "kg", minStock: "2,5" }, null], [{ minStock: "dua" }, "Batas stok menipis: isi angka, mis. 20"],
])("sel %o → masalah %s", …);
test("nama barang terjual dengan Dijual per lain → perbaiki \"'Dijual per' tidak bisa diubah — barang sudah terjual\"", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** PASS + `npm test`. **Step 5:** commit `feat(mock): periksa dan impor barang dari baris Excel`.

---

### Task 6: Aturan angka panjang (juga tile Beranda)

**Files:** Create `web/src/shared/lib/fit-font-size.ts` (+ test), `web/src/features/owner/common/fit-amount.tsx` (+ test); Modify `home/kpi-tiles.tsx`, `home/beranda-page.tsx` (angka omzet), `beranda-page.test.tsx`.

**Interfaces — Produces:**
```ts
export function fitFontSize(text: string, availablePx: number, range: { max: number; min: number }): number;
// <FitAmount text={string} max={number} min={number} className?={string} /> — ukur lebar induk (ResizeObserver; tanpa RO → max), font-size inline, whitespace-nowrap, tanpa truncate
```
Algoritme (pakai persis): `em` = Σ lebar karakter (digit `0.64`, `R` `0.68`, `p` `0.64`, `.` dan `,` `0.28`, `-` dan `−` `0.42`, spasi `0.28`, lainnya `0.64`); `availablePx <= 0` → `max`; selain itu `clamp(Math.floor(availablePx / em), min, max)`. Skala: hero `{max: 34, min: 22}`, tile `{max: 21, min: 13}`, baris harga detail `{max: 17, min: 13}`. Pada `min` teks boleh membungkus (`overflow-wrap: anywhere`) — tidak pernah "…".

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([
  ["Rp361.500", 132, 21], ["Rp12.345.678", 132, 18], ["Rp1.234.567.890", 132, 15], ["-Rp123.456.789.012", 132, 13],
])("tile %s di %ipx → %ipx", (t, w, px) => expect(fitFontSize(t, w, { max: 21, min: 13 })).toBe(px));
test.each([["Rp4.872.500", 296, 34], ["Rp123.456.789.012", 296, 29]])("hero %s → %i", …);
test("lebar 0 (belum diukur) → max", () => expect(fitFontSize("Rp1", 0, { max: 21, min: 13 })).toBe(21));
test("FitAmount: RO palsu lebar 132 → 'Rp12.345.678' font-size 18px, tanpa kelas truncate", () => {});
test("Beranda: tile Laba kotor Rp12.345.678 tidak memakai truncate dan font-size < 21px", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi; Beranda hero & tile memakai `FitAmount`. **Step 4:** `npm test`. **Step 5:** commit `feat(owner): ukuran huruf angka panjang turun bertahap`.

---

### Task 7: Daftar barang, rute Barang, dan header sub-halaman

**Files:** Create `web/src/features/owner/products/product-model.ts` (+ test), `products/barang-page.tsx`, `products/product-row.tsx`, `products/status-badge.tsx`, `web/src/features/owner/common/sub-page-header.tsx`; Modify `pages.tsx` (hapus `BarangPage` sementara), `index.ts`, `owner-layout.tsx` (`useActiveTitle` hanya cocok persis dengan akar tab), `web/src/app/router.tsx`, `web/src/app/styles.css` (token Global Constraints); Tests `products/barang-page.test.tsx`, `owner-layout.test.tsx`, `app/router.test.tsx`.

**Interfaces — Consumes:** `useListOwnerProducts`, `formatQty`, `formatRupiah`. **Produces:**
```ts
export type ProductFilter = { q: string; kategori: string | null; nonaktif: boolean };
export function filterProducts(rows: OwnerProductRow[], f: ProductFilter): OwnerProductRow[]; // q: tanpa beda huruf, includes pada nama, storeCode, tiap barcode; nonaktif=false → buang status nonaktif; nonaktif=true → hanya nonaktif
export function categoryChips(rows: OwnerProductRow[]): { label: string; count: number }[];  // barang bukan-nonaktif, kategori berisi, urut label; null → "Tanpa kategori"
export type Badge = { key: "minus" | "menipis" | "langka" | "tidak_diambil" | "belum_dihitung" | "nonaktif"; label: string; tone: "danger" | "warning" | "neutral" };
export function productBadges(p: Pick<OwnerProductRow, "status" | "scarce" | "stockCounted" | "stockAlert">): Badge[]; // urutan = urutan key
export function stockText(row: OwnerProductRow): string | null;   // "Stok 86,5 kg"; null bila belum dihitung
// <StatusBadge badge={Badge} /> ; <SubPageHeader title eyebrow? back={{ label: string; fallback: "/owner/barang" }} action?={ReactNode} />
```
Rute (anak `ownerRoute`, semua dari chunk owner): `barang` → `BarangPage` dengan `validateSearch` `{ q?: string; kategori?: string; nonaktif?: true }`; `barang/baru` → `ProductFormPage` (Task 9); `barang/impor` → `ImportPage` (Task 12); `barang/$productId` → `ProductDetailPage` dengan `{ lembar?: "harga" | "habis" }`; `barang/$productId/ubah` → `ProductFormPage`. Sampai halaman Task 8/9/12 ada, rute itu memakai komponen `Segera hadir` (hapus di task masing-masing). Kembali di `SubPageHeader`: `useCanGoBack()` → `router.history.back()`, selain itu ke `fallback`.
- Daftar: baris alat di bawah judul besar: kolom cari (ikon cari; tombol kamera disisipkan Task 10) + tombol ikon `Menu lainnya` (dropdown: `Impor dari Excel` → `/owner/barang/impor`; `Unduh template Excel` = `<a href="/templates/data-barang.xlsx" download="data-barang.xlsx">`) + `Tambah barang` → `/owner/barang/baru`. Chip bergulir horizontal (`Semua`, kategori, `Nonaktif` bila ada). Kartu daftar: baris `Link` ke detail, `content-visibility: auto; contain-intrinsic-size: auto 64px`, kunci `id`; nama, `stockText` + tanda, harga `{Rp}/{satuan}` kanan, chevron.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("filterProducts: '0896' → Indomie; '1003' → Bimoli; 'BIMOLI' → Bimoli; nonaktif disembunyikan kecuali filter nonaktif", () => {});
test.each([
  [{ status: "aktif", scarce: false, stockCounted: true, stockAlert: "minus" }, ["Minus"]],
  [{ status: "tidak_diambil", scarce: true, stockCounted: true, stockAlert: "none" }, ["Sedang langka", "Tidak diambil lagi"]],
  [{ status: "nonaktif", scarce: false, stockCounted: false, stockAlert: "none" }, ["Stok belum dihitung", "Nonaktif"]],
])("productBadges %o", …);
test("halaman: judul besar Barang; Indomie 'Rp3.100/pcs'; chip 'Semua 60'; chip 'Mi Instan {n}' menyaring", async () => {});
test("tanda Menipis tampil dengan ikon aria-hidden + teks; barang belum dihitung menampilkan 'Stok belum dihitung' tanpa angka", async () => {});
test("Menu lainnya berisi Impor dari Excel (ke /owner/barang/impor) dan Unduh template Excel (href /templates/data-barang.xlsx, download)", async () => {});
test("cari & kategori di URL: buka detail lalu kembali → filter tetap", async () => {});
test("sub-halaman /owner/barang/baru tidak menampilkan judul besar 'Barang' dari kerangka", async () => {});
test("kosong → 'Tidak ada barang yang cocok'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup layar 1. **Step 4:** `npm test && npm run e2e` (E2E lama tetap lolos). **Step 5:** commit `feat(owner): daftar barang dengan cari, filter kategori, dan tanda status`.

---

### Task 8: Detail barang, status, hapus, dan dialog habis

**Files:** Create `products/detail/product-detail-page.tsx`, `detail/price-card.tsx`, `detail/stock-card.tsx`, `detail/barcode-card.tsx`, `detail/price-history-card.tsx`, `detail/status-card.tsx`, `detail/status-sheet.tsx`, `detail/stock-out-dialog.tsx`, `detail/movements-sheet.tsx`, `products/price-lines.ts` (+ test); Modify `web/src/shared/lib/business-day.ts` (+ test), router; Test `detail/product-detail-page.test.tsx`.

**Interfaces — Consumes:** `useGetOwnerProduct`, `useListOwnerProductMovements`, `useSetOwnerProductStatus`, `useDeleteOwnerProduct`, `markup`, `FitAmount`, `SubPageHeader`, `StatusBadge`. **Produces:**
```ts
// products/price-lines.ts — dipakai detail & lembar harga (Task 10)
export type PriceLineView = { key: string; unitId: string; tierMinQty: number | null; label: string; detail: string; unitSize: number; price: number; cost: number | null };
export function priceLines(p: OwnerProduct): PriceLineView[];  // eceran, tier (urut minQty), satuan besar aktif; label "Eceran"/"Grosir"/"Dus" (huruf awal besar), detail "per pcs"/"beli 40+ pcs"/"isi 40 pcs"
export function historyLabel(e: PriceHistoryEntry): string;     // "Eceran" | "Grosir 40+" | "Dus"
// business-day.ts
export function jakartaTime(ms: number): string;                // "14.05"
export function relativeDayTime(ms: number, now: number): string; // "Hari ini 14.05" | "Kemarin 09.10" | "28 Okt 14.05"
export function formatDateLong(ms: number): string;             // "28 Okt 2026" (Jan Feb Mar Apr Mei Jun Jul Agu Sep Okt Nov Des)
```
- Atas: `SubPageHeader` (kembali `Barang`, aksi `Ubah` → `/owner/barang/$productId/ubah`), keterangan `{kategori} · dijual per {satuan}` (tanpa kategori: `dijual per {satuan}`), h1 nama, tanda status bila ada.
- Kartu `Harga` (dari `priceLines`), `Stok` (stok, batas, `HPP rata-rata` = modal eceran, `Riwayat stok` 5 terbaru + `Lihat semua` → sheet `Riwayat stok` dari `listOwnerProductMovements`), `Barcode` (satuan aktif), `Riwayat harga` (≤ 10 terbaru), kartu status (`Status barang` → sheet; sakelar `Sedang langka` = `role="switch"`), `Hapus barang` (hanya `!hasSales`) / teks larangan.
- `?lembar=habis` & `status === "tidak_diambil"` & `stock <= 0` → dialog habis; `Nonaktifkan` → status nonaktif; `Biarkan aktif` → status aktif; tutup → `navigate({ search: {}, replace: true })`. Selain itu parameter diabaikan.
- Mutasi apa pun → invalidasi query detail, daftar, dan ringkasan pemilik.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("Indomie: 'Mi Instan · dijual per pcs'; Eceran · per pcs Rp3.100 'Modal Rp2.600 · untung Rp500 (19% dari modal)'; Grosir · beli 40+ pcs Rp2.800 'Modal Rp2.600 · untung Rp200 (8% dari modal)'; Dus · isi 40 pcs Rp112.000 'Modal Rp104.000 · untung Rp8.000 (8% dari modal)'", async () => {});
test("stok: 'Batas menipis' 10 pcs; 'HPP rata-rata' Rp2.600 /pcs; barcode 089686010947 'Eceran · pcs', 189686010944 'Dus · isi 40 pcs'", async () => {});
test("Gula Pasir: 'Gula & Tepung · dijual per kg'; stok dengan koma (formatQty)", async () => {});
test("modal null → 'Modal belum diisi'", async () => {});
test("Rina jual 2 Indomie → 'Terjual 2 pcs' / 'Hari ini {HH.MM} · Kasir Rina' / '−2'; Lihat semua membuka sheet Riwayat stok", async () => {});
test("riwayat harga setelah PUT prices → 'Eceran' 'Rp3.100 → Rp3.500' / '{tgl} · oleh Pemilik'", async () => {});
test("Status barang → Nonaktif → Simpan status → tanda Nonaktif; daftar default tidak memuatnya", async () => {});
test("sakelar Sedang langka → daftar menampilkan tanda Sedang langka", async () => {});
test("barang baru tanpa penjualan: Hapus barang → konfirmasi 'Hapus Teh Pucuk Harum 350 ml?' → Hapus → kembali ke daftar, barang hilang", async () => {});
test("barang terjual: tanpa tombol Hapus barang; teks larangan tampil", async () => {});
test("?lembar=habis pada tidak_diambil stok 0 → dialog '{nama} habis'; Biarkan aktif → status aktif, parameter lembar hilang", async () => {});
test("id tidak ada → 'Barang tidak ditemukan' + 'Kembali ke daftar barang'", async () => {});
test.each([[/* hari ini 14.05 WIB */, "Hari ini 14.05"], [/* kemarin 09.10 */, "Kemarin 09.10"], [/* 28 Okt 2026 14.05 */, "28 Okt 14.05"]])("relativeDayTime", …);
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup 2a/2b. **Step 4:** `npm test`. **Step 5:** commit `feat(owner): detail barang dengan harga, stok, riwayat, dan status`.

---

### Task 9: Form tambah & ubah barang

**Files:** Create `products/form/product-form-page.tsx`, `form/form-state.ts` (+ test), `form/money-field.tsx`, `form/form-section.tsx`; Modify router; Test `form/product-form-page.test.tsx`.

**Interfaces — Consumes:** `validateDraft`, `hppFromDraft`, `unitCost`, `markup`, `sellUnitKind`, `useCreateOwnerProduct`, `useUpdateOwnerProduct`, `useGetOwnerProduct`, `useListOwnerCategories`, `readProblem`. **Produces:**
```ts
export type FormValues = Record<ProductField, string>;                 // teks mentah isian
export function emptyFormValues(): FormValues;
export function formValuesFromProduct(p: OwnerProduct): FormValues;      // satuan besar = satuan aktif pertama setelah eceran; modal di field sumbernya
export function draftFromForm(v: FormValues): { draft: ProductDraft; problems: RuleProblem[] }; // parseRupiah; batas "2,5"/"2.5"; angka tak terbaca → "{Kolom}: ketik angka saja, mis. 3500"
export function inputFromDraft(d: ProductDraft, bigUnitId: string | null): ProductInput;
export function firstErrorByField(problems: RuleProblem[] | FieldError[]): Partial<Record<ProductField, string>>;
export const productValidationProblemSchema: z.core.$ZodType<ProductValidationProblem>; // di web/src/shared/api/problem.ts
export function ProductFormPage(): JSX.Element;  // baru bila tanpa productId
```
- Bagian & label persis tabel teks UI; `Kategori`, `Dijual per`, `Satuan` = `<input list>` dengan `<datalist>` (kategori dari API; satuan kecil `pcs bungkus buah botol kaleng sachet butir kg ons liter`; satuan besar `dus slop renceng pak lusin karton bal karung krat`); isian uang `inputMode="numeric"`.
- Petunjuk untung langsung (markup) di bawah Eceran, Grosir, Satuan besar. Bila modal satuan besar terisi: isian `Harga modal` eceran diganti teks `Dihitung dari modal {besar}: {Rp}`.
- Simpan: `validateDraft` di klien → pesan pertama per field (`aria-invalid`, `aria-describedby`), fokus ke field salah pertama; lolos → mutasi; 422 `errors` → dipetakan ke field; tombol nonaktif selama pending. Sukses → ke detail barang (replace).
- Ubah barang terjual (`units[0].sold`): `Dijual per` `disabled` + `Tidak bisa diubah — barang sudah terjual`; `Isi` satuan besar terjual juga. `Hapus satuan besar` mengosongkan bagian (server menonaktifkan/menghapus).
- `Batal` → kembali (detail saat ubah, daftar saat tambah) tanpa menyimpan.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("tambah Teh Pucuk lengkap → petunjuk dan simpan", async () => {
  // isi: Nama, Kategori Minuman, Dijual per botol, Barcode 8996001600269, Harga modal 3000, Harga jual 4000
  // → "Untung Rp1.000 (33% dari modal) per botol"
  // Grosir 12 / 3750 → "Untung Rp750 (25% dari modal) per botol"
  // Satuan besar dus / 24 / – / 70000 / 84000 → "Dihitung dari modal dus: Rp2.917";
  //   eceran "Untung Rp1.083 (37% dari modal) per botol"; grosir "Untung Rp833 (29% dari modal) per botol";
  //   besar "Untung Rp14.000 (20% dari modal) per dus · setara Rp3.500 per botol"
  // Batas 24 → Simpan → heading "Teh Pucuk Harum 350 ml"; mockDb: cost {70000,24}
});
test("Simpan kosong → 'Nama barang belum diisi', ''Dijual per' belum diisi', 'Harga jual belum diisi'; tanpa request", async () => {});
test("harga jual 2500 modal 3000 → 'Harga jual di bawah modal (Rp3.000)'", async () => {});
test("barcode 089686010947 → error server 'Barcode sudah dipakai: Indomie Goreng' di bawah Barcode", async () => {});
test("ubah Indomie (terjual): Dijual per & Isi dus disabled dengan keterangan; ubah harga jual 3200 → Simpan → detail Rp3.200", async () => {});
test("kategori baru 'Frozen Food' tersimpan dan muncul di datalist", async () => {});
test("kg: batas '2,5' diterima → minStock 2500", async () => {});
test("klik Simpan dua kali cepat → satu POST", async () => {});
test("Batal → kembali tanpa request", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup 4a/4b. **Step 4:** `npm test`. **Step 5:** commit `feat(owner): form tambah dan ubah barang dengan validasi template`.

---

### Task 10: Scan barcode dengan kamera HP

**Files:** Create `products/scan/barcode-scanner.tsx`, `scan/use-barcode-support.ts`, `scan/scan-button.tsx`, `scan/barcode-detector.d.ts` (deklarasi tipe global minimal); Modify `form/product-form-page.tsx` (tombol di `Barcode` eceran & besar), `barang-page.tsx` (tombol di kolom cari); Tests `scan/barcode-scanner.test.tsx`, `scan/use-barcode-support.test.ts`, form & daftar.

**Interfaces — Produces:**
```ts
export const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a"] as const;
export function useBarcodeSupport(): boolean;   // false sampai BarcodeDetector.getSupportedFormats() memuat "ean_13"
export function BarcodeScanner(props: { open: boolean; purpose: "eceran" | "besar" | "cari";
  onDetected: (code: string) => void; onManual: () => void; onClose: () => void }): JSX.Element;
export function ScanButton(props: { purpose: "eceran" | "besar" | "cari"; onDetected: (code: string) => void; onManual: () => void }): JSX.Element | null; // null bila tidak didukung
```
- Layar penuh (Dialog Radix, latar `--color-scan-bg`, teks putih): `Batal` kiri, judul `Scan barcode` + keterangan per `purpose`, video `getUserMedia({ video: { facingMode: "environment" } })`, bingkai bidik, `Arahkan kamera ke barcode`, senter (hanya bila `track.getCapabilities().torch`; `applyConstraints({ advanced: [{ torch }] })`), `Ketik manual`.
- Deteksi tiap 150 ms (`setInterval`, bukan rAF), abaikan hasil yang `!isValidBarcode`; pertama yang valid → `navigator.vibrate?.(50)`, `onDetected`, tutup. Semua track dihentikan saat tutup/unmount. `getUserMedia` gagal → pesan gagal + `Ketik manual`.
- Form: kode terisi ke isian terkait lalu fokus ke isian berikutnya; `Ketik manual` → fokus isian barcode. Daftar: kode → `q`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("tanpa BarcodeDetector → tidak ada tombol 'Scan dengan kamera' di form maupun daftar", async () => {});
test("dengan BarcodeDetector palsu (ean_13) → tombol ada", async () => {});
test("deteksi 'ABC' diabaikan, lalu '8996001600269' → onDetected sekali, vibrate(50), semua track stop", async () => {});
test("senter: capability torch → 'Nyalakan senter' memanggil applyConstraints({advanced:[{torch:true}]}) lalu label 'Matikan senter'; tanpa capability → tidak ada tombol", async () => {});
test("getUserMedia NotAllowedError → 'Kamera tidak bisa dibuka — ketik barcode secara manual'", async () => {});
test("Batal → onClose dan track stop; Ketik manual → onManual", async () => {});
test("form: scan di Barcode eceran mengisi 8996001600269", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup 5. **Step 4:** `npm test`. **Step 5:** commit `feat(owner): scan barcode dengan kamera HP lewat BarcodeDetector`.

---

### Task 11: Notifikasi modal & lembar ubah harga

**Files:** Create `products/price/cost-sheet.tsx`, `price/cost-sheet-model.ts` (+ test); Modify `home/home-model.ts` (+ test), `home/attention-list.tsx`, `detail/product-detail-page.tsx` (`?lembar=harga`); Tests `price/cost-sheet.test.tsx`, `beranda-page.test.tsx`.

**Interfaces — Consumes:** `priceLines`, `unitCost`, `markup`, `suggestedPrice`, `useUpdateOwnerProductPrices`, `useDismissOwnerCostAlert`, `parseRupiah`. **Produces:**
```ts
// home-model.ts (menggantikan AttentionItem G1; field `to` dihapus)
export type AttentionLink =
  | { to: "/owner/barang" | "/owner/lainnya" | "/owner/kasbon" }
  | { to: "/owner/barang/$productId"; params: { productId: string }; search: { lembar: "harga" | "habis" } };
export type AttentionItem = { key: string; title: string; detail: string; tone: "warning" | "critical";
  icon: "stock" | "cost" | "stockout" | "cash" | "credit"; link: AttentionLink };
// urutan: stok minus, perubahan modal, stok menipis, barang habis, selisih kas, kasbon > 30 hari
// ikon lucide: stock TriangleAlert, cost Tag, stockout PackageX, cash Wallet, credit NotebookPen
// cost-sheet-model.ts
export type CostLine = PriceLineView & { oldCost: number; newCost: number; profitBefore: number; profitAfter: number;
  percentBefore: number | null; percentAfter: number | null; suggested: number | null };
export function costLines(p: OwnerProduct): CostLine[];   // dari priceLines; oldCost = unitCost(costAlert.fromCost, unitSize), newCost = unitCost(cost, unitSize)
export function costDirection(p: OwnerProduct): "naik" | "turun";  // dari baris eceran
```
- Butir: `title` `Harga modal {nama} naik|turun {Rp |selisih eceran|}`, `detail` `Untung jadi {price − newCost}`, tone `warning`, link `lembar: "harga"`; habis: `{nama} habis` / `Tidak diambil lagi`, warning, `lembar: "habis"`.
- Lembar (Sheet Radix dari bawah; laptop di tengah ≤ 480px): satu blok per `CostLine` sesuai tabel teks; isian `atau ketik harga sendiri` kosong (placeholder = saran) dengan teks `untung dihitung otomatis` atau, saat diketik, `untung {Rp} ({n}% dari modal)`. Tombol utama `Pakai harga ini` → `PUT prices` dengan, per baris, harga diketik bila ada atau saran (baris tanpa saran dan tanpa ketikan tidak dikirim); label `Simpan harga` bila ada ketikan. `Harga tetap` → `DELETE cost-alert`. `Nanti saja` / `Tutup` → hanya menutup. 422 → pesan di blok sesuai `field` (`price` eceran, `tierPrice` grosir, `bigPrice` besar). Sukses → tutup, invalidasi detail/daftar/ringkasan. `costAlert` null → parameter diabaikan.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([
  [{ costChanges: [{ productName: "Indomie Goreng", oldCost: 2600, newCost: 2700, price: 3100 }] },
   { title: "Harga modal Indomie Goreng naik Rp100", detail: "Untung jadi Rp400", tone: "warning", icon: "cost" }],
  [{ costChanges: [{ productName: "Indomie Goreng", oldCost: 2600, newCost: 2500, price: 3100 }] },
   { title: "Harga modal Indomie Goreng turun Rp100", detail: "Untung jadi Rp600" }],
  [{ stockOuts: [{ productName: "Indomie Goreng" }] }, { title: "Indomie Goreng habis", detail: "Tidak diambil lagi", icon: "stockout" }],
])("attentionItems %o", …);   // juga: link {to:"/owner/barang/$productId", params, search:{lembar:"harga"|"habis"}}; urutan sesuai Interfaces
test("costLines Indomie {104000,40} → {108000,40}", () => {
  // eceran: oldCost 2600, newCost 2700, price 3100, profit 500→400, percent 19→15, suggested 3500
  // grosir 40+: price 2800, profit 200→100, 8→4, suggested 3000
  // dus: oldCost 104000, newCost 108000, price 112000, profit 8000→4000, 8→4, suggested 116500
});
test("lembar dari Beranda: ketuk butir → judul 'Harga modal naik', 'Rp2.600 → Rp2.700', '+Rp100 · oleh Pemilik, {HH.MM}', 'Turun: Rp500 → Rp400', 'Harga saran Rp3.500 · untung tetap 19%'", async () => {});
test("Pakai harga ini → harga 3500 / tier 3000 / dus 116500; butir hilang dari Beranda; 3 entri riwayat harga", async () => {});
test("ketik 3.400 di eceran → tombol 'Simpan harga', 'untung Rp700 (26% dari modal)'; simpan → eceran 3400, lainnya saran", async () => {});
test("ketik 2.500 → error di blok eceran 'Harga jual di bawah modal (Rp2.700)'; lembar tetap terbuka", async () => {});
test("Harga tetap → butir hilang, harga tidak berubah; Nanti saja → butir tetap", async () => {});
test("sumber impor → 'lewat Impor Excel'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup 3. **Step 4:** `npm test`. **Step 5:** commit `feat(owner): notifikasi modal berubah dan lembar ubah harga dengan harga saran`.

---

### Task 12: Layar impor — pembaca .xlsx ringan, template, dan fixture

**Files:** Create `products/import/read-xlsx.ts` (+ test), `import/import-rows.ts` (+ test), `import/import-page.tsx`, `import/import-preview.tsx` (+ test `import-page.test.tsx`), `web/scripts/make-template.py` (salinan generator dari `.superpowers/brainstorm/make-template.py`, sudah mendukung GTIN-14), `web/scripts/make-import-fixture.py`, `web/public/templates/data-barang.xlsx` (hasil `python scripts/make-template.py public/templates/data-barang.xlsx`), `web/src/test/fixtures/data-barang-contoh.xlsx` (hasil `make-import-fixture.py`: template `LAST=50` + baris `IMPORT_ROWS`; baris 9 kosong); Modify `web/src/app/pwa-options.ts` (`navigateFallbackDenylist` + `/^\/templates\//`), `pwa-config.test.ts`, router.

**Interfaces — Consumes:** `useCheckOwnerProductImport`, `useCommitOwnerProductImport`, `IMPORT_ROWS`. **Produces:**
```ts
// read-xlsx.ts — HANYA dimuat lewat `await import("./read-xlsx")` dari import-page (chunk terpisah)
export class ImportFileError extends Error {}
export type SheetRow = { row: number; cells: Partial<Record<string, string>> };   // kunci = huruf kolom
export async function readSheet(data: ArrayBuffer, sheetName: string): Promise<SheetRow[]>;
// import-rows.ts
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export function toImportRows(rows: SheetRow[]): ImportRow[];   // baris ≥ 3; B..O → field ImportRow; trim; "" → null; baris yang B..O semuanya null dibuang
```
`readSheet` (pendekatan): cari End of Central Directory (`0x06054b50`, mundur ≤ 65.557 byte) → entri central directory (`0x02014b50`: metode, ukuran terkompresi, offset local header, nama) → data = setelah local header `30 + nameLen + extraLen`; metode 0 apa adanya, 8 lewat `new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }).pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()`; `TextDecoder` + `DOMParser("application/xml")`. Sheet: `xl/workbook.xml` `<sheet name r:id>` → `xl/_rels/workbook.xml.rels` target. Sel `<c r t>`: `t="s"` → `sharedStrings` (gabung semua `<t>` dalam `<si>`), `t="inlineStr"` → `<is>`, lainnya → teks `<v>`; sel rumus diabaikan hanya bila kolom A (toImportRows tidak membaca A). Galat → `ImportFileError` dengan teks Global Constraints.

Halaman `/owner/barang/impor`: `SubPageHeader` judul `Impor dari Excel`; indikator langkah; langkah 1 tombol `Pilih file` (`<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">`; > 5 MB → galat tanpa membaca); baca → `toImportRows` (0 baris → `Tidak ada baris barang di file ini`) → `checkOwnerProductImport`; langkah 2: kartu file (`{nama}`, `{n} baris · {k} KB`, `Ganti file`), 3 ringkasan, filter, catatan urutan, tabel (≥ 1024px tabel penuh; < 1024px dalam wadah `overflow-x-auto`, halaman tanpa gulir horizontal), kolom `Masalah` = `problems` (merah) atau `changes`/`notes` (muted) atau `—`, digabung ` · `; catatan bawah; `Batal` (ke daftar) · `Impor {ready+update} barang` (nonaktif bila 0) → commit dengan baris yang sama → toast `{created} barang baru, {updated} diperbarui` → `/owner/barang`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
import fixtureUrl from "@/test/fixtures/data-barang-contoh.xlsx?inline";   // data URL base64 → ArrayBuffer lewat atob
test("readSheet + toImportRows(fixture) === IMPORT_ROWS (baris 9 dan baris 15–50 yang hanya berumus dibuang)", async () => {});
test("bukan zip → ImportFileError 'File ini bukan file .xlsx yang bisa dibaca'; zip tanpa sheet Barang → 'Sheet \"Barang\" tidak ditemukan — pakai template Excel dari aplikasi'", async () => {});
test("toImportRows: sel '  Indomie ' → 'Indomie'; sel kosong → null; baris 2 (judul) diabaikan", () => {});
test("halaman: pilih fixture → '3 baris siap', '1 akan diperbarui', '6 perlu diperbaiki'; baris 5 'Perbaiki' 'Harga jual di bawah modal (Rp34.000)'; baris 14 satuan besar 'Karung isi 25 · Rp340.000'", async () => {});
test("filter 'Perlu diperbaiki 6' → 6 baris; 'Semua 11' → 11", async () => {});
test("Impor 4 barang → toast '3 barang baru, 1 diperbarui' → daftar memuat 'Teh Kotak Jasmine 300 ml' dengan 'Stok belum dihitung'", async () => {});
test("Ganti file → kembali ke langkah Pilih file; file 6 MB → 'File terlalu besar (maks. 5 MB)'", async () => {});
test("pwaOptions: navigateFallbackDenylist memuat /^\\/templates\\//", () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi; jalankan kedua skrip Python sekali, commit file hasilnya. **Step 4:** `npm test && npm run build && npm run size:check` → ada chunk `read-xlsx-*.js` ≤ 25 KB dan `grep -c "deflate-raw" dist/assets/owner-*.js` = 0. **Step 5:** commit `feat(owner): impor barang dari Excel dengan pembaca xlsx tanpa dependensi` (sebutkan di badan commit: pembaca sendiri dipilih karena platform menyediakan DecompressionStream + DOMParser; tidak ada dependensi baru).

---

### Task 13: E2E barang & harga

**Files:** Create `web/e2e/owner-barang.spec.ts`; Modify `web/e2e/owner-helpers.ts` (`stubBarcodeCamera(page, code)` lewat `page.addInitScript`: `window.BarcodeDetector` palsu + `navigator.mediaDevices.getUserMedia` → `canvas.captureStream()`), `web/e2e/kasir-flows.spec.ts` (nonaktif).

- [ ] **Step 1: Tulis test** (project `owner-hp` dan `owner-laptop`, kecuali disebut):
  - Tambah barang lewat form (dengan scan kamera palsu mengisi `8996001600269`) → detail menampilkan `Modal Rp2.917 · untung Rp1.083 (37% dari modal)` → daftar menampilkan `Stok belum dihitung`.
  - Ubah modal dus Indomie ke `108000` lewat `Ubah` → Beranda `Harga modal Indomie Goreng naik Rp100` → ketuk → `Pakai harga ini` → butir hilang, detail `Rp3.500`, riwayat `Rp3.100 → Rp3.500`.
  - Menu `⋯` → `Impor dari Excel` → `setInputFiles("src/test/fixtures/data-barang-contoh.xlsx")` → ringkasan 3/1/6 → `Impor 4 barang` → daftar memuat `Gas Elpiji 3 kg`; `Unduh template Excel` memicu `download` bernama `data-barang.xlsx`.
  - Nonaktifkan Bimoli di halaman pemilik, lalu di tab kasir (context sama): scan `8992696404441` → `Barang ini tidak dijual lagi`; cari `bimoli` → tanpa hasil.
  - 360px: tile Beranda dengan Laba kotor ≥ Rp10 jt (penjualan besar dibuat lewat API mock) dan kartu harga detail tidak meluber (`el.scrollWidth <= el.clientWidth` untuk elemen angka; `document.documentElement.scrollWidth <= innerWidth` di daftar, detail, form, impor).
  - axe tanpa pelanggaran serius di daftar, detail, form, lembar harga, layar scan, impor (360 & 1280); tidak ada request ke luar.
- [ ] **Step 2:** `npm run e2e` → semua lolos (E2E F1–G1 tetap).
- [ ] **Step 3:** verifikasi penuh: `npm run lint && npm run typecheck && npm run knip && npm run gen:check && npm test && npm run build && npm run size:check`; lihat hasilnya di 360×800 dan 1280×800 lalu bandingkan dengan mockup (layar 1–6), hapus screenshot sementara.
- [ ] **Step 4:** commit `test(e2e): alur barang, harga, impor, dan barang nonaktif di kasir`.

---

## Di luar cakupan F3b-1 (dicatat)

- Barang masuk, HPP rata-rata tertimbang, isian modal hanya-baca setelah barang masuk, supplier & utang, foto nota, kedaluwarsa, stok opname (mengisi `stockCounted`), app HP orang toko → F3b-2. `StockMovement.kind` baru (`masuk`, `opname`) ditambah di sana.
- Lebih dari satu tier grosir per satuan di form/impor (template hanya satu).
- Laporan + ekspor (F3c), mode gelap, harga otomatis.
- Backend Go: semua aturan Task 2/4/5 dipindah ke `catalog/domain.go`; kontrak tetap.
