# Rencana F3a — Login Pemilik & Beranda: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemilik bisa login dari HP (realm terpisah dari kasir), lalu melihat Beranda: omzet hari ini dibanding hari yang sama minggu lalu, grafik per jam, 4 angka kunci, dan daftar "Perlu perhatian" — di atas backend palsu yang kini punya HPP, stok minimum, buku kasbon, dan riwayat 14 hari.

**Architecture:** Kontrak diperluas dengan endpoint `/api/owner/*` (cookie `owner_session`). Backend palsu (state v3) mencatat HPP per penjualan dan buku kasbon append-only, lalu menghitung ringkasan dari data penjualan. UI owner mendapat gerbang login, header hidup (tanggal & status toko), banner offline yang tidak menghapus halaman, dan Beranda dengan grafik SVG buatan sendiri.

**Tech Stack:** (dari F1/F2) React 19, TS strict, TanStack Router/Query, orval + zod/mini, MSW 2, Tailwind 4 tokens, Vitest, Playwright + axe. Tanpa library chart.

**Spec:** `docs/specs/2026-10-17-frontend-design.html` §8 (Aplikasi pemilik) dan §12a (kontrak & login, disetujui 23 Okt 2026); `docs/specs/2026-10-17-arsitektur-kasir-design.html` §5 (aturan data: HPP disalin ke item penjualan, kasbon = ledger); `docs/conventions.md`. Sisa dari F1/F2: lihat Task 4 dan Task 2.

## Global Constraints

- Semua constraint F1 & F2 tetap berlaku (`docs/plans/2026-10-20-F2-layar-kasir.md` → Global Constraints) termasuk `docs/conventions.md`; pemeriksaan wajib hijau: `lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check` (owner chunk ≤ 50 KB gzip), `e2e`.
- Endpoint pemilik hanya di `/api/owner/…`; sesi pemilik terpisah total dari sesi kasir (cookie `owner_session`, 30 hari).
- HPP dan laba **tidak pernah** dikirim ke endpoint kasir; hanya endpoint `/api/owner/*` yang memuat HPP/laba.
- Hari bisnis memakai zona `Asia/Jakarta`.
- Warna grafik lewat token baru: `--color-chart-1: #1f7a4d` (hari ini), `--color-chart-2: #2a78d6` (minggu lalu; divalidasi dataviz: semua cek lulus di light). Garis minggu lalu putus-putus (encoding kedua). Teks/label tetap token teks, bukan warna seri.
- Tidak ada library chart; grafik SVG sendiri sesuai aturan dataviz: garis 2px, satu sumbu Y, grid samar, legenda selalu ada (2 seri) + label langsung di ujung garis, crosshair + tooltip saat disentuh/hover, tabel data tersembunyi untuk pembaca layar.
- Ikon status memakai lucide + teks (bukan emoji, bukan warna saja).
- Teks UI tetap (pakai persis):

| Kunci | Teks |
|---|---|
| login | judul `Masuk pemilik`, label `Nama`, `Password`, tombol `Masuk` |
| login salah | `Nama atau password salah` |
| keluar | tombol `Keluar` (di tab Lainnya) |
| status toko | `● toko online` / `● toko offline` |
| banner offline | `Tidak terhubung ke toko — data terakhir ditampilkan` |
| memuat | `Memuat…` |
| omzet | `OMZET HARI INI` |
| perbandingan | `▲ {n}% dari {Hari} lalu` · `▼ {n}% dari {Hari} lalu` · `Sama dengan {Hari} lalu` · `Belum ada data {Hari} lalu` |
| grafik | judul `Omzet per jam`, legenda `Hari ini` · `{Hari} lalu` |
| tile | `LABA KOTOR` · `TRANSAKSI` · `KASBON BARU` · `RATA-RATA / STRUK` |
| perhatian | judul `PERLU PERHATIAN`; `{n} barang stok menipis` · `{n} barang stok minus` · `Selisih kas shift {kasir} {±Rp…}` · `{n} kasbon > 30 hari · {Rp…}`; kosong: `Semua aman hari ini` |

## Review Focus

1. **Pemilik login di HP saat kasir sedang shift** → sesi/kunci kasir tidak berubah, dan kasir mengunci layar tidak mengeluarkan pemilik. Dites di Task 3 (handler) dan Task 4 (UI).
2. **Belum ada penjualan hari ini / minggu lalu nol** → tidak ada pembagian nol, teks perbandingan masuk akal, grafik kosong rapi. Dites di Task 5 dan Task 6.
3. **Lewat tengah malam saat aplikasi terbuka** → tanggal header dan "hari ini" pindah ke hari baru tanpa reload. Dites di Task 4 dan Task 7.
4. **Sinyal HP putus saat melihat Beranda** → halaman tetap, banner offline muncul, pulih sendiri. Dites di Task 4.
5. **Grafik dengan satu titik data / semua nol / angka sangat besar** → tanpa `NaN`, sumbu wajar. Dites di Task 6.

---

### Task 1: Kontrak API pemilik (F3a)

**Files:** Modify `api/openapi.yaml`; regenerate `web/src/shared/api/gen/**`; Modify `web/src/shared/api/contract.test.ts`.

**Interfaces — Produces:**
- `ErrorCode` + `LOGIN_INVALID` (total 14; perbarui test jumlah enum).
- Security scheme `ownerCookieAuth` (apiKey, in cookie, name `owner_session`) dipasang pada `/api/owner/session`, `/api/owner/logout`, `/api/owner/summary/today`.
- `OwnerLogin {name: string (minLength 1), password: string (minLength 1)}`; `OwnerSession {user: User}` (role pemilik).
- `OwnerTodaySummary {date: "YYYY-MM-DD", weekdayLastWeek: string (mis. "Jumat"), revenue, grossProfit, salesCount, newCredit, avgTicket, lastWeekRevenue, hourly: HourBucket[24], attention: Attention}`; `HourBucket {hour (0–23), revenue, lastWeekRevenue}`; `Attention {lowStockCount, negativeStockCount, cashDifferences: CashDifference[], overdueCredit: {count, total}}`; `CashDifference {shiftId, kasirName, closedAt (int64 ms), difference}`. Semua uang integer; deskripsi: revenue/grossProfit/newCredit/avgTicket hanya penjualan `selesai`; `avgTicket = round_half_up(revenue / salesCount)`, 0 bila tidak ada.

| Method & path | operationId | Sukses | Error |
|---|---|---|---|
| `POST /api/owner/login` `OwnerLogin` | `ownerLogin` | 200 `OwnerSession` | 401 `LOGIN_INVALID`, 423 `LOCKED_OUT`, 422 `VALIDATION` |
| `GET /api/owner/session` | `getOwnerSession` | 200 `OwnerSession` | 401 `UNAUTHORIZED` |
| `POST /api/owner/logout` | `ownerLogout` | 204 | — |
| `GET /api/owner/summary/today` | `getOwnerTodaySummary` | 200 `OwnerTodaySummary` | 401 `UNAUTHORIZED` |

- Tag baru `owner`.

- [ ] **Step 1:** tulis kontrak + test (`ErrorCode` 14 nilai; zod `OwnerLoginBody` menolak `name` kosong; tipe `OwnerTodaySummary.hourly` array). **Step 2:** `npm run gen && npx vitest run src/shared/api/contract.test.ts` → PASS; typecheck bersih. **Step 3:** commit `feat(api): kontrak login pemilik dan ringkasan hari ini`.

---

### Task 2: State palsu v3 — HPP, stok minimum, buku kasbon

**Files:** Modify `web/src/mocks/db.ts`, `web/src/mocks/seed-data.ts`, `web/src/mocks/handlers/sales.ts`, `web/src/mocks/sale-rules.ts` (atau helper baru `web/src/mocks/ledger.ts`); Test `web/src/mocks/db.test.ts`, `seed-data.test.ts`, `handlers/sales.test.ts`, `web/src/mocks/ledger.test.ts`.

**Interfaces — Produces:**
- `MockState.version = 3` (versi lain → reseed). Tambahan: `unitCosts: Record<unitId, number>` (HPP per satuan jual, integer); `minStock: Record<productId, number>` (qtyBase); `creditLedger: CreditEntry[]` dengan `CreditEntry {id, customerId, amount (+ kasbon / − pelunasan/batal), at (ms), saleId: string | null}`; `ownerSession: {userId} | null`; `ownerLoginFailures: Record<userId, {count, lockedUntil|null}>`; `MockUser` pemilik mendapat `password` (mock saja; seed Pak Ahmad `pemilik123`).
- `MockSale = Sale & { costTotal: number }` disimpan di `state.sales`; **semua respons endpoint kasir membuang `costTotal`** (helper `toPublicSale(s: MockSale): Sale`).
- `costTotal` saat penjualan = Σ `round_half_up(unitCost × qtyBase ÷ unitSize)` per item (pakai `roundHalfUp`); dibatalkan tidak mengubah costTotal (status yang menentukan).
- Penjualan kasbon menambah `CreditEntry(+credit)`; batal menambah `CreditEntry(−credit)`; `customer.balance` tetap = Σ ledger pelanggan itu (invariant dites).
- Seed: `unitCosts` = 85–93% harga (rng, dibulatkan ke Rp50); fixture tetap: Gula Pasir kg 16.500, Beras Pandan Wangi 5 kg 71.000, Indomie pcs 2.650 / dus 104.000. `minStock`: 10 satuan dasar ×unitSize (curah 10 kg = 10000 g), dan **7 barang** di-seed dengan stok di bawah minimum (deterministik). Saldo pelanggan seed dibangun dari ledger: Bu Sari 120.000 (2 entri, terlama 40 hari lalu), Pak Joko 290.000 (terlama 12 hari lalu), Pak Udin 50.000 (terlama 35 hari lalu), Bu Tini 640.000 (terlama 45 hari lalu), Mbak Dewi 0.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("respons createSale/listTodaySales tidak memuat costTotal", async () => {});
test("costTotal penjualan contoh = Σ HPP item", async () => { /* gula 1500 g × 16.500/kg = 24750; beras ×1 = 71000 … */ });
test("kasbon menambah ledger; batal menambah entri negatif; balance = Σ ledger", async () => {});
test("seed: 7 barang di bawah stok minimum; saldo pelanggan = Σ ledger seed", () => {});
test("state v2 di localStorage → reseed v3", () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test` hijau (semua test F2 tetap lolos). **Step 5:** commit `feat(mock): HPP, stok minimum, dan buku kasbon (state v3)`.

---

### Task 3: Riwayat 14 hari & handler pemilik

**Files:** Create `web/src/mocks/history.ts`, `web/src/mocks/owner-summary.ts`, `web/src/mocks/handlers/owner.ts`; Modify `handlers/index.ts`, `seed-data.ts` (`createSeedState(now = Date.now())`); Tests `history.test.ts`, `owner-summary.test.ts`, `handlers/owner.test.ts`.

**Interfaces — Produces:**
- `generateHistory(state, now): void` — untuk **14 hari sebelum hari ini** (Asia/Jakarta; hari ini TIDAK diisi, agar Riwayat kasir dan E2E F2 tetap bersih — angka hari ini berasal dari aktivitas nyata di `/kasir`), buat penjualan `selesai` deterministik (rng): 40–160 transaksi/hari (Sabtu/Minggu ×1,3), jam 06.00–21.00 dengan pola ramai 07–09 & 16–19, 1–6 item dari katalog seed memakai `priceLine` (HPP via `unitCosts`), metode 80% tunai / 15% QRIS / 5% kasbon (kasbon menulis ledger). Shift tertutup per hari (Rina pagi, Budi sore) dengan selisih kas acak ∈ {0, 0, 0, −5000, +2000}. Nomor struk lewat `saleSeq`. Riwayat bergantung pada tanggal bisnis `now` saja (bukan milidetik): `createSeedState(now = Date.now())` deterministik untuk tanggal yang sama — perbarui test determinisme F2 agar memberi `now` tetap. Stok dikurangi sesuai penjualan, lalu `minStock` fixture menjaga 7 barang di bawah minimum.
- `ownerTodaySummary(state, now): OwnerTodaySummary` (pure) sesuai kontrak; `weekdayLastWeek` = nama hari Indonesia untuk `now − 7 hari`; `overdueCredit` = pelanggan dengan saldo > 0 yang entri kasbon tertua belum lunas (FIFO terhadap pelunasan) berumur > 30 hari.
- Handler: `ownerLogin` (nama cocok tanpa beda huruf, role pemilik, password; 5x salah → 423 `LOCKED_OUT` 5 menit, pesan `Coba lagi dalam 5 menit`; salah → 401 `LOGIN_INVALID`), `getOwnerSession`, `ownerLogout`, `getOwnerTodaySummary` (butuh `ownerSession`); semua dibungkus `withScenario`. **Sesi pemilik tidak menyentuh `state.session` kasir dan sebaliknya.**

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("ringkasan: revenue/salesCount/avgTicket/grossProfit dari penjualan selesai hari ini saja", () => {});
test("hari tanpa penjualan → avgTicket 0, hourly 24 bucket nol", () => {});
test("hourly.lastWeekRevenue = omzet jam yang sama 7 hari lalu", () => {});
test("overdueCredit menghitung Bu Sari, Pak Udin, Bu Tini (> 30 hari)", () => {});
test("tutup shift hari ini dengan selisih −5000 → cashDifferences memuat Rina −5000; riwayat seed tidak menambah penjualan hari ini", () => {});
test("riwayat deterministik untuk now yang sama", () => {});
test("login pemilik tidak mengubah sesi kasir; logout kasir tidak mengubah sesi pemilik", async () => {});
test("5x password salah → 423; benar setelah 5 menit → 200", async () => {});
test("summary tanpa sesi pemilik → 401", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): riwayat 14 hari, login pemilik, dan ringkasan hari ini`.

---

### Task 4: Kerangka aplikasi pemilik — gerbang login, header hidup, offline, memuat

**Files:** Create `web/src/features/owner/auth/owner-gate.tsx`, `owner-login-screen.tsx`, `web/src/shared/hooks/use-business-day.ts`; Modify `web/src/features/owner/owner-layout.tsx`, `pages.tsx` (Lainnya: tombol `Keluar`), `web/src/app/router.tsx` (`defaultPendingComponent` → `Memuat…`); Tests `owner-gate.test.tsx`, `use-business-day.test.ts`, `owner-layout.test.tsx`.

**Interfaces — Produces:**
- `useBusinessDay(): { date: string /* YYYY-MM-DD Asia/Jakarta */; label: string /* "Jumat, 23 Okt" */ }` — berganti otomatis tepat setelah tengah malam WIB (setTimeout ke tengah malam berikutnya, dibersihkan saat unmount).
- `<OwnerGate>`: `getOwnerSession` (tanpa retry; 401 = belum login) → `OwnerLoginScreen` atau isi; 401 dari query/mutasi `/api/owner/*` mana pun → kembali ke login.
- `OwnerLoginScreen`: `Masuk pemilik`, input `Nama` + `Password` (type password), `Masuk`; salah → `Nama atau password salah`; terkunci → `pesanError` (`Terlalu banyak…`).
- Header: tanggal dari `useBusinessDay`, `ShaziaMart`, `● toko online`/`● toko offline` (dari `useServerHealth`, warna token + ikon/teks).
- Offline (sisa F1 #6): bila data pernah dimuat, halaman **tetap** dan banner `role="status"` `Tidak terhubung ke toko — data terakhir ditampilkan` tampil di atas; layar penuh "Tidak bisa terhubung ke toko…" hanya bila belum ada data sama sekali.
- `Keluar` di tab Lainnya → `ownerLogout` → layar login.

- [ ] **Step 1: Tulis test yang gagal**

```tsx
test("tanpa sesi → Masuk pemilik; Pak Ahmad / pemilik123 → Beranda", async () => {});
test("password salah → 'Nama atau password salah'", async () => {});
test("kasir mengunci layar tidak mengeluarkan pemilik (state.session vs ownerSession)", async () => {});
test("offline setelah data dimuat → halaman tetap + banner; pulih → banner hilang", async () => {});
test("useBusinessDay berganti tepat setelah 00.00 WIB (fake timers)", () => {});
test("Keluar → layar login", async () => {});
test("route lazy menampilkan 'Memuat…' saat chunk belum siap", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test && npm run e2e` (F1 shell + F2 tetap lolos; sesuaikan E2E owner F1 yang kini butuh login: login dulu di helper). **Step 5:** commit `feat(owner): login pemilik, header hidup, dan offline tanpa menghapus halaman`.

---

### Task 5: Logika murni Beranda

**Files:** Create `web/src/features/owner/home/home-model.ts`; Modify `web/src/shared/lib/money.ts` (`formatRupiahShort`); Tests `home-model.test.ts`, `money.test.ts`.

**Interfaces — Produces:**
- `comparisonText(revenue: number, lastWeekRevenue: number, weekday: string): { text: string; trend: "up" | "down" | "flat" | "none" }` — `lastWeekRevenue === 0` → `Belum ada data {weekday} lalu` (none); sama → `Sama dengan …` (flat); selain itu persen = `round_half_up(|rev − last| × 100 ÷ last)` → `▲ {n}% dari {weekday} lalu` / `▼ …`.
- `hourWindow(hourly: HourBucket[]): { from: number; to: number }` — jam pertama s/d terakhir yang punya omzet di salah satu seri, minimal rentang 6 jam yang berpusat di jam sekarang bila semua nol (default 06–21 jika kosong total).
- `attentionItems(a: Attention): { key: string; text: string; tone: "warning" | "critical"; to: string }[]` — urutan: stok minus (critical, `/owner/barang`), stok menipis (warning, `/owner/barang`), selisih kas per shift (critical bila < 0, warning bila > 0; `/owner/lainnya`), kasbon > 30 hari (warning, `/owner/kasbon`); item dengan nilai 0 tidak ditampilkan.
- `formatRupiahShort(n)`: `< 1.000` → `Rp{n}`; `< 1.000.000` → `Rp{x} rb` (1 desimal bila perlu, koma Indonesia, mis. `Rp12,5 rb`); selebihnya `Rp{x} jt` (mis. `Rp4,9 jt`).

- [ ] **Step 1: Test tabel** (contoh: 4.872.500 vs 4.350.000 → `▲ 12% dari Jumat lalu`; 0 vs 0 → `Belum ada data Jumat lalu`; 361.500 → `Rp361,5 rb`; 4.872.500 → `Rp4,9 jt`; selisih −5000 → `Selisih kas shift Rina −Rp5.000`). **Step 2:** RED. **Step 3:** implementasi. **Step 4:** PASS. **Step 5:** commit `feat(owner): logika ringkasan beranda`.

---

### Task 6: Grafik omzet per jam (SVG)

**Files:** Create `web/src/features/owner/home/hourly-chart.tsx`; Modify `web/src/app/styles.css` (token `--color-chart-1`, `--color-chart-2`); Test `hourly-chart.test.tsx`.

**Interfaces — Consumes:** `hourWindow`, `formatRupiahShort`, `formatRupiah`. **Produces:** `<HourlyChart hourly={HourBucket[]} weekday={string} />`.
- Lebar responsif (viewBox, `width: 100%`), tinggi 160px; satu sumbu Y dengan 3 garis grid samar (`--border`) berlabel `formatRupiahShort` (teks muted 11px, `num`); sumbu X tiap 3 jam `HH.00`.
- Seri: `Hari ini` garis 2px `--color-chart-1` solid; `{weekday} lalu` garis 2px `--color-chart-2` putus-putus `4 3`. Garis hari ini berhenti di jam sekarang (jam setelahnya tidak digambar).
- Legenda di atas grafik (2 entri: garis contoh + nama) dan label langsung kecil di ujung kanan tiap garis.
- Interaksi: pointer/touch di area plot → crosshair vertikal + titik 8px pada kedua garis + tooltip `{HH.00}` · `Hari ini Rp…` · `{weekday} lalu Rp…` (teks token, bukan warna seri); fokus keyboard (`tabIndex=0`) dengan `←`/`→` memindah crosshair; `Esc` menyembunyikan.
- Aksesibilitas: `role="img"` dengan `aria-label` ringkasan (`Omzet per jam hari ini dan {weekday} lalu`) + tabel `sr-only` (jam, hari ini, minggu lalu).
- Aman: satu titik, semua nol (sumbu 0–Rp100 rb), angka besar (≥ Rp100 jt) — tanpa `NaN`/`Infinity` di atribut SVG.

- [ ] **Step 1: Test** (render data contoh → dua `<path>` dengan stroke token; semua nol → tidak ada `NaN` di `d`; satu bucket → tidak crash; keyboard `→` memindah tooltip ke jam berikutnya; tabel sr-only memuat 24/rentang baris). **Step 2:** RED. **Step 3:** implementasi. **Step 4:** PASS + jalankan validator dataviz tidak perlu ulang (palet tetap). **Step 5:** commit `feat(owner): grafik omzet per jam`.

---

### Task 7: Halaman Beranda

**Files:** Create `web/src/features/owner/home/beranda-page.tsx`, `kpi-tiles.tsx`, `attention-list.tsx`, `web/src/shared/hooks/use-pull-to-refresh.ts`; Modify `pages.tsx`/router (Beranda memakai halaman baru); Test `beranda-page.test.tsx`, `use-pull-to-refresh.test.ts`.

**Interfaces — Consumes:** `useGetOwnerTodaySummary`, `useBusinessDay`, Task 5–6. **Produces:** Beranda sesuai mockup spec §8.
- Query ringkasan: `refetchInterval: 60_000`, query key memuat tanggal bisnis (`useBusinessDay().date`) sehingga berganti hari = data baru.
- Hero: `OMZET HARI INI` + `formatRupiah(revenue)` 26px + teks perbandingan (ikon panah + warna token `--primary` naik / `--danger` turun / muted lainnya, selalu dengan teks).
- `<HourlyChart>` dalam kartu berjudul `Omzet per jam`.
- 4 tile 2×2: `LABA KOTOR`, `TRANSAKSI`, `KASBON BARU`, `RATA-RATA / STRUK` (angka `num`).
- `PERLU PERHATIAN`: `attentionItems` sebagai tautan (ikon lucide `TriangleAlert`/`Wallet`/`NotebookPen` + teks); kosong → `Semua aman hari ini`.
- Tarik untuk refresh: `usePullToRefresh(onRefresh)` — di layar sentuh, tarik > 64px dari scrollTop 0 → indikator `Memuat…` + `refetch`; tidak aktif di pointer mouse.
- Skeleton saat memuat pertama; error → `pesanError` + `Coba lagi`.

- [ ] **Step 1: Test** (setelah satu penjualan dibuat lewat handler, omzet & tile tampil dari mock dan grafik memuat garis minggu lalu dari riwayat; perhatian menampilkan 7 stok menipis dan kasbon > 30 hari, plus selisih Rina −Rp5.000 setelah shift ditutup dengan selisih itu; tanpa penjualan → `Belum ada data …` & `Semua aman hari ini` bila attention kosong; ganti hari (fake timers) → query key baru; pull-to-refresh memanggil refetch). **Step 2:** RED. **Step 3:** implementasi sesuai mockup. **Step 4:** PASS; `npm run size:check` (owner ≤ 50 KB). **Step 5:** commit `feat(owner): beranda dengan omzet, grafik, angka kunci, dan perlu perhatian`.

---

### Task 8: E2E pemilik

**Files:** Create `web/e2e/owner-flows.spec.ts`, `web/e2e/owner-helpers.ts`; Modify `web/e2e/shell.spec.ts` (owner tests login dulu).

- [ ] **Step 1: Test** (project `owner-hp` dan `owner-laptop`): login Pak Ahmad → Beranda menampilkan `OMZET HARI INI`, grafik (`role=img` berlabel), 4 tile, `PERLU PERHATIAN`; password salah → pesan; `server-mati` setelah data dimuat → banner offline & halaman tetap; kasir login di tab lain (context sama) tidak mengeluarkan pemilik; axe tanpa pelanggaran serius di 360 & 1280; tidak ada request ke luar.
- [ ] **Step 2:** `npm run e2e` → semua lolos. **Step 3:** verifikasi penuh (`lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check`). **Step 4:** commit `test(e2e): alur pemilik login dan beranda`.

---

## Di luar cakupan F3a (dicatat)
- Barang, harga, grosir (termasuk penghalang 409 tier dari F2), barang masuk, opname → F3b.
- Laporan + ekspor, kasbon detail/pelunasan, shift & kas, kasir, log aktivitas, pengaturan → F3c.
- Notifikasi push, mode gelap.
