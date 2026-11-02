# Rencana G1 — Gaya Apple untuk Aplikasi Pemilik: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi pemilik tampil bergaya Apple (HIG + Liquid Glass) sesuai mockup C4: latar grouped, kartu putih bulat, judul besar per tab, tab bar kaca mengambang, kartu omzet berpita hijau, grafik batang ala Health, daftar "Perlu perhatian" ala Settings — tanpa mengubah layar kasir.

**Architecture:** Token khusus pemilik ditimpa di `:root[data-app="owner"]` (atribut dipasang selama aplikasi pemilik terpasang, sehingga portal dialog ikut), plus utilitas `glass` untuk navigasi. Kerangka pemilik memindahkan judul halaman ke header bersama. Grafik garis diganti grafik batang dengan kontrak aksesibilitas yang sama. Model "Perlu perhatian" dipecah jadi judul + keterangan.

**Tech Stack:** (tetap) React 19, TS strict, TanStack Router/Query, Tailwind 4 tokens, lucide-react, Vitest + Testing Library, Playwright + axe. Tanpa dependensi baru.

**Spec:** `docs/specs/2026-10-17-frontend-design.html` §12b (disetujui 2 Nov 2026) + mockup `docs/specs/assets/2026-11-02-owner-c4.html`; §8 dan §12a tetap berlaku; `docs/conventions.md`.

## Global Constraints

- Semua constraint F1/F2/F3a tetap; pemeriksaan wajib hijau: `lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check` (owner chunk ≤ 50 KB gzip), `e2e`.
- **Layar kasir tidak berubah**: token global di `@theme` tidak diubah nilainya; semua nilai pemilik hanya lewat `:root[data-app="owner"]`. Test & E2E kasir tetap lolos tanpa diubah.
- Tanpa dependensi baru; tanpa font/ikon Apple (SF, SF Symbols). Font Inter, ikon lucide (`strokeWidth` 1.75–2).
- Kontras: teks ≥ 4,5:1, elemen UI/grafik utama ≥ 3:1 (axe di 360 & 1280 tanpa pelanggaran serius).
- Nilai token pemilik (pakai persis): `--color-bg #f2f2f7`, `--color-muted #6e6e73` (5,07:1 di putih; 4,54:1 di `#f2f2f7`), `--color-border #e5e5ea`, `--radius-lg 20px`, teks dasar 16px. Grafik: `--color-chart-1 #1f7a4d` (hari ini), `--color-chart-1-now #2e9a62` (jam berjalan; 3,55:1), `--color-chart-2 #d1d1d6` (Jumat lalu, batang latar). Pita omzet: gradien `#1f7a4d → #155c3b` dengan teks putih (≥ 5,3:1).
- Liquid Glass (`glass`) hanya untuk tab bar, sidebar, dan bar judul kecil — tidak untuk kartu konten. Bila `backdrop-filter` tak didukung atau `prefers-reduced-transparency: reduce` → latar padat `--color-surface`.
- Animasi hanya `transform`/`opacity`; `prefers-reduced-motion` dihormati.
- Teks UI (pakai persis; yang tidak disebut tetap seperti F3a):

| Kunci | Teks |
|---|---|
| judul halaman | `Beranda` · `Barang` · `Laporan` · `Kasbon` · `Lainnya` (h1, = label tab) |
| status toko | `Toko online` / `Toko offline` (titik warna terpisah, `aria-hidden`) |
| omzet | `Omzet hari ini` |
| grafik | judul `Omzet per jam`; ringkasan `Paling ramai jam {HH.00} · {Rp singkat}` / tanpa penjualan `Belum ada penjualan hari ini`; legenda `Hari ini` · `{Hari} lalu` |
| tile | `Laba kotor` · `Transaksi` · `Kasbon baru` · `Rata-rata / struk` |
| perhatian | judul `Perlu perhatian`; butir judul/keterangan: `Stok minus` / `{n} barang` · `Stok menipis` / `{n} barang` · `Selisih kas {±Rp…}` / `Shift {kasir}` · `Kasbon > 30 hari` / `{n} pelanggan · {Rp…}`; kosong `Semua aman hari ini` |
| halaman sementara | `Segera hadir` |

## Review Focus

1. **Pindah dari /owner ke /kasir di tab yang sama** → atribut `data-app` hilang, kasir kembali ke token asli. Dites di Task 1.
2. **Butir terakhir halaman di balik tab bar kaca** → bisa digulir sampai terlihat penuh di atas tab bar (360×800). Dites di Task 6 (E2E).
3. **Teks panjang di 360px** (omzet ≥ Rp100 jt di pita, nama kasir panjang di keterangan) → tidak meluber, halaman tanpa gulir horizontal. Dites di Task 4 dan Task 6.
4. **Belum ada penjualan hari ini** → tanpa batang hari ini, tanpa label jam tersibuk, ringkasan `Belum ada penjualan hari ini`, tanpa `NaN`. Dites di Task 5.
5. **Pengguna keyboard** → fokus terlihat pada item tab bar kaca dan grup grafik. Dites di Task 3 dan Task 6.

---

### Task 1: Token & lingkup tema pemilik

**Files:** Modify `web/src/app/styles.css`, `web/src/features/owner/owner-layout.tsx`; Test `web/src/features/owner/owner-layout.test.tsx`.

**Interfaces — Produces:** atribut `document.documentElement.dataset.app === "owner"` selama `OwnerLayout` terpasang (dihapus saat dilepas); blok `:root[data-app="owner"]` dengan nilai Global Constraints (termasuk `body { font-size: 16px }` di lingkup itu); token global baru `--color-chart-1-now`, `--color-glass: rgb(255 255 255 / 0.72)`, `--color-chart-2` diganti `#d1d1d6`; `@utility glass` (latar `--color-glass`, `backdrop-filter: blur(22px) saturate(180%)`, garis tepi 0.5px putih 70%, bayangan halus) dengan fallback padat lewat `@supports not (backdrop-filter: blur(1px))` dan `@media (prefers-reduced-transparency: reduce)`.

- [ ] **Step 1: Test gagal**
```tsx
test("OwnerLayout memasang data-app=owner dan melepasnya saat unmount", async () => {
  const { unmount } = renderOwner(); // helper yang sudah ada di owner-layout.test
  await screen.findByRole("heading", { name: "Beranda" });
  expect(document.documentElement.dataset.app).toBe("owner");
  unmount();
  expect(document.documentElement.dataset.app).toBeUndefined();
});
```
- [ ] **Step 2:** `npx vitest run src/features/owner/owner-layout.test.tsx` → FAIL.
- [ ] **Step 3:** `useEffect` di `OwnerLayout` (bukan file baru) + CSS di `styles.css`.
- [ ] **Step 4:** test PASS; `npm run test` (kasir tetap hijau).
- [ ] **Step 5:** commit `feat(owner): token gaya Apple dalam lingkup aplikasi pemilik`.

### Task 2: Header bersama — judul besar, tanggal, pil status, bar judul kecil

**Files:** Create `web/src/features/owner/page-header.tsx`, `web/src/shared/hooks/use-scrolled-past.ts`; Modify `owner-layout.tsx` (header lama "ShaziaMart" diganti), `pages.tsx` (h1 placeholder → `<p className="text-muted">Segera hadir</p>`), `home/beranda-page.tsx` (hapus h1 sr-only); Tests `page-header.test.tsx`, `use-scrolled-past.test.ts`, update `owner-layout.test.tsx`, `app/router.test.tsx`, `e2e/owner-flows.spec.ts` (status `Toko online/offline`).

**Interfaces — Consumes:** `navItems` (owner-layout), `useBusinessDay().label`, `useServerHealth()`. **Produces:** `<PageHeader title={string} />`; `useScrolledPast(ref: RefObject<Element | null>): boolean` (IntersectionObserver; `false` bila tidak tersedia); judul aktif = `label` item `navItems` yang cocok dengan rute (cocokkan seperti `Link` `activeOptions.exact`).
- Header: tanggal 13px muted, baris berisi `<h1>` 32px tebal + pil status (latar `primary-soft`/merah muda, titik `aria-hidden`, teks `Toko online`/`Toko offline`, `role="status"`, kosong saat masih memeriksa — perilaku F3a).
- Bar judul kecil (`glass`, `aria-hidden="true"`, tinggi ±52px, `fixed` atas) muncul hanya < 1024px saat judul besar tergulir lewat; fade `opacity`.

- [ ] **Step 1: Test gagal**
```tsx
test("judul halaman = tab aktif", async () => { /* /owner/kasbon → heading level 1 "Kasbon" */ });
test("pil status: Toko online lalu Toko offline saat server mati", async () => {});
test("useScrolledPast: true saat elemen keluar viewport (IntersectionObserver palsu), false tanpa IO", () => {});
test("header tidak lagi menampilkan ShaziaMart; halaman sementara menampilkan Segera hadir", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm run test && npm run e2e` (perbarui `● toko online/offline` → `Toko online/offline` di E2E). **Step 5:** commit `feat(owner): judul besar per halaman, pil status, dan bar judul kaca saat digulir`.

### Task 3: Navigasi kaca, layar login & offline

**Files:** Modify `owner-layout.tsx` (`OwnerNav`, `OfflineBanner`, `OwnerOffline`, pembungkus `main`), `auth/owner-login-screen.tsx`; Tests update `owner-layout.test.tsx`, `auth/owner-gate.test.tsx`, `e2e/shell.spec.ts`.

**Interfaces — Consumes:** `glass` (Task 1).
- HP: `<nav aria-label="Navigasi utama">` kapsul `glass` `fixed` (`inset-x-3`, bawah `calc(12px + env(safe-area-inset-bottom))`, `rounded-full`), 5 item tinggi ≥ 48px, item aktif latar hijau tipis (`primary-soft`) + teks/ikon `primary`; `main` diberi ruang bawah ≥ tinggi kapsul + 24px.
- ≥ 1024px: sidebar `glass` (sticky, sudut bulat 20px, jarak 12px dari tepi), item aktif seperti HP; tanpa bar judul kecil.
- Banner offline & layar "Tidak bisa terhubung…" bergaya kartu putih bulat (ikon + teks tetap).
- Login: latar grouped, kartu putih bulat berisi "ShaziaMart", judul `Masuk pemilik`, input, tombol penuh lebar; teks tetap.

- [ ] **Step 1: Test gagal**
```tsx
test("nav: 5 tautan, aktif ditandai aria-current=page", async () => {});
test("fokus keyboard pada tautan tab terlihat (kelas focus-visible ada / outline token)", async () => {});
```
plus E2E di `shell.spec.ts`: `Tab` ke tautan `Kasbon` di owner-hp → `toBeFocused()` dan outline terlihat (`toHaveCSS("outline-style", "solid")`).
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm run test && npm run e2e`. **Step 5:** commit `feat(owner): tab bar dan sidebar kaca, login dan layar offline bergaya baru`.

### Task 4: Perlu perhatian ala Settings & kartu angka kunci

**Files:** Modify `home/home-model.ts` (`AttentionItem`), `home/attention-list.tsx`, `home/kpi-tiles.tsx`; Delete `home/card-style.ts`; Tests `home-model.test.ts`, `beranda-page.test.tsx`, `e2e/owner-flows.spec.ts`.

**Interfaces — Produces:** `type AttentionItem = { key: string; title: string; detail: string; tone: "warning" | "critical"; to: "/owner/barang" | "/owner/lainnya" | "/owner/kasbon" }` (field `text` dihapus; urutan & aturan F3a tetap). Copy persis dari tabel teks UI.
- Daftar: kartu putih bulat, baris ≥ 56px: kotak ikon 30px bersudut 8px berlatar `danger` (critical) / `warning` (peringatan) dengan ikon putih (ikon per tujuan seperti F3a), judul 16px, keterangan 13px muted `truncate`, `ChevronRight` muted; pemisah tipis mulai setelah ikon. Judul bagian `Perlu perhatian` 20px tebal.
- Tile: kartu putih bulat tanpa garis tepi; label 13px muted, angka 21px tebal `num` `truncate`.

- [ ] **Step 1: Test gagal**
```ts
test.each([
  [{ negativeStockCount: 3 }, { title: "Stok minus", detail: "3 barang", tone: "critical" }],
  [{ lowStockCount: 7 }, { title: "Stok menipis", detail: "7 barang", tone: "warning" }],
  [{ cash: { kasirName: "Rina", difference: -5000 } }, { title: "Selisih kas -Rp5.000", detail: "Shift Rina", tone: "critical" }],
  [{ overdue: { count: 2, total: 290000 } }, { title: "Kasbon > 30 hari", detail: "2 pelanggan · Rp290.000", tone: "warning" }],
])("attentionItems %o", () => {});
```
(Tanda minus mengikuti `formatRupiah`, ruling R8 F3a.) Plus tes Beranda: label tile `Laba kotor` dst.; nama kasir 40 karakter → elemen keterangan punya kelas `truncate`.
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm run test && npm run e2e` (perbarui teks E2E: `Perlu perhatian`, label tile). **Step 5:** commit `feat(owner): perlu perhatian ala Settings dan kartu angka kunci baru`.

### Task 5: Geometri grafik batang

**Files:** Modify `home/hourly-chart-geometry.ts` (+ test); hapus yang tak terpakai (`separate`, `endLabels`, `todayPath`, `lastWeekPath`).

**Interfaces — Consumes:** `hourWindow(hourly, nowHour)`, `formatRupiahShort`. **Produces:**
```ts
type Bar = { hour: number; x: number; width: number;
  today: { y: number; height: number; now: boolean } | null; // null setelah jam data
  lastWeek: { y: number; height: number } };
buildChart({ hourly, nowHour, width }): {
  plot; hours; bars: Bar[];
  ticks: { value: number; y: number; label: string }[];   // 0, setengah, puncak; label di KANAN plot
  hourTicks: { hour: number; x: number; label: string }[]; // tiap 3 jam
  peak: { hour: number; x: number; y: number; label: string } | null; // label = formatRupiahShort
  x; clamp; hourAt; row; // tetap seperti F3a
}
peakSummary(hourly: HourBucket[], nowHour: number): string
```
- Lebar batang 66% slot; batang hari ini lebih sempit 3px dan di atas batang Jumat lalu; `now` = jam terakhir yang punya data hari ini (≤ `nowHour`).
- Puncak = omzet hari ini tertinggi s/d `nowHour`; seri → jam paling awal; semua nol → `null`. Label puncak diletakkan di atas batang, x dijepit agar tidak melewati `plot.right` atau `plot.left`.
- `peakSummary`: `Paling ramai jam {HH.00} · {formatRupiahShort}`; tanpa penjualan `Belum ada penjualan hari ini`.

- [ ] **Step 1: Test gagal** (tabel): data contoh → jumlah batang = jam jendela, batang hari ini berhenti di `nowHour`, `now` hanya satu; seri 500/500 → puncak jam lebih awal; semua nol → `peak === null`, `peakSummary` = `Belum ada penjualan hari ini`, tidak ada `NaN` di semua angka; nilai ≥ Rp100 jt → tick atas `Rp1 M`/sesuai `formatRupiahShort` tanpa `Infinity`; label puncak di jam paling kanan tetap ≤ `plot.right`.
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** PASS. **Step 5:** commit `refactor(owner): geometri grafik batang per jam`.

### Task 6: Kartu omzet C4 + grafik batang, uji akhir

**Files:** Modify `home/hourly-chart.tsx`, `home/hourly-chart-parts.tsx`, `home/beranda-page.tsx` (Hero → kartu C4; skeleton disesuaikan); Tests `hourly-chart.test.tsx`, `beranda-page.test.tsx`, `e2e/owner-flows.spec.ts`.

**Interfaces — Consumes:** Task 5. Kontrak a11y tetap: grup fokus `role="group"` berlabel `Omzet per jam hari ini dan {Hari} lalu`, pembacaan `aria-live`, tabel sr-only, ←/→/Esc, sentuh/geser.
- Kartu C4: satu kartu; pita gradien hijau (label `Omzet hari ini`, angka ±34px tebal `num`, pil perbandingan putih transparan) lalu bagian putih: h2 `Omzet per jam` (13px semibold muted), kalimat `peakSummary`, grafik, legenda kotak warna (`Hari ini` hijau, `{Hari} lalu` abu).
- Grafik: batang membulat 3px; Jumat lalu `--color-chart-2` di belakang; hari ini `--color-chart-1`, jam berjalan `--color-chart-1-now`; label puncak teks token; garis bantu `--color-border`; label sumbu kanan & jam 11px muted. Jam aktif: batang disorot + tooltip (teks token).
- Lebar ≥ 1024px: dua kolom R12 tetap.

- [ ] **Step 1: Test gagal**
```tsx
test("batang: rect hari ini berwarna token chart-1, jam berjalan chart-1-now", () => {});
test("ringkasan puncak tampil; tanpa penjualan → 'Belum ada penjualan hari ini'", async () => {});
test("→ memindah jam aktif dan pembacaan aria-live; Esc menyembunyikan", () => {});
```
E2E (owner-hp & owner-laptop): Beranda tampil `Omzet hari ini`, grup grafik berlabel, 4 tile, `Perlu perhatian`; omzet di-mock ≥ Rp100 jt tidak meluber (`document.documentElement.scrollWidth <= innerWidth`); gulir ke butir terakhir `Perlu perhatian` → kotak butir berada di atas kotak tab bar; `Tab` ke grup grafik → `toBeFocused()`; axe tanpa pelanggaran serius.
- [ ] **Step 2:** RED. **Step 3:** implementasi; lihat hasilnya (screenshot 360×800 & 1280×800, bandingkan dengan mockup C4; hapus file sementara). **Step 4:** pemeriksaan penuh (`lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check`, `e2e`). **Step 5:** commit `feat(owner): kartu omzet berpita hijau dan grafik batang per jam`.

---

## Di luar cakupan G1 (dicatat)

- Layar kasir gaya macOS (§12b "Kasir (menyusul)") — mockup & rencana terpisah setelah G1.
- Mode gelap.
