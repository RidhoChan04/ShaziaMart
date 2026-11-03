# Rencana F3b-2a — Barang Masuk: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orang toko masuk di HP dengan akun kasir (nama + PIN) dan mencatat nota supplier — supplier, tanggal, foto nota, baris barang (cari/scan, satuan nota, jumlah, harga beli, ED), pembayaran — termasuk barang baru berstatus "Menunggu harga jual"; draf tersimpan di HP dan dikirim ulang dengan aman; server memperbarui stok (ledger) dan HPP rata-rata tertimbang dan memberi butir modal ke pemilik; nota bisa diubah (staf) dan dibatalkan (pemilik) dengan jejak audit; pemilik melihat utang supplier dan menandainya lunas; tutup shift kasir menampilkan baris "Bayar supplier".

**Architecture:** Kontrak diperluas dengan realm ketiga `/api/staff/…` (tag `staff`, cookie `staff_session`, semua endpoint menolak header terowongan dengan 403 `STAFF_LAN_ONLY`), endpoint nota & utang pemilik di `/api/owner/…`, dan `ShiftClosure.supplierPayments`. Rumus HPP adalah fungsi murni di `mocks/receipts/hpp.ts` (hanya server) dan aturan nota/pembayaran/tanggal di `shared/lib/receipt-rules.ts` (dipakai form untuk pratinjau dan server untuk keputusan). App orang toko adalah bagian ketiga yang di-lazy-load (`/staff`, chunk `staff-*`) dengan token gaya yang sama dengan pemilik; draf disimpan di IndexedDB dan dikirim oleh mesin sinkron single-flight yang idempoten per ID draf (= ID nota).

**Tech Stack:** (tetap) React 19, TS strict, TanStack Router/Query, orval + zod/mini, MSW 2, Tailwind 4 tokens, lucide-react, Vitest + Testing Library, Playwright + axe. Platform: IndexedDB, `createImageBitmap` + `<canvas>.toBlob("image/jpeg")`, `BarcodeDetector`, `getUserMedia`, `<input type="date">`. Tanpa dependensi baru.

**Spec:** `docs/specs/2026-10-17-frontend-design.html` §12e (disetujui 3 Nov 2026; mengikat termasuk semua butir "Detail dari review desain", baris "Angka", dan baris "Pembagian rencana" F3b-2a) + mockup `docs/specs/assets/2026-11-02-stok.html` layar 1–4 (orang toko) dan 9a/9b (utang, app pemilik); §12d (F3b-1, dipakai ulang: HPP rasio, notifikasi modal, scan kamera, `FitAmount`, `SubPageHeader`), §12a, §12b tetap berlaku; `docs/specs/2026-10-17-arsitektur-kasir-design.html` §5 (uang int, `round_half_up`, stok = ledger append-only, waktu UTC ms, hari bisnis WIB) dan §9 (cookie HttpOnly/SameSite, HPP tidak pernah ke sesi kasir); `docs/conventions.md`.

## Global Constraints

- Semua constraint F1/F2/F3a/G1/F3b-1 tetap; pemeriksaan wajib hijau: `lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check` (kasir ≤ 50 KB, owner ≤ 50 KB, **staff ≤ 50 KB** gzip; lihat K15 untuk total), `e2e`.
- **Realm orang toko:** semua endpoint di `/api/staff/…`, cookie `staff_session`, terpisah dari `kasir_session` dan `owner_session` (login/keluar di satu realm tidak menyentuh dua lainnya). Setiap request `/api/staff/…` (termasuk login) yang membawa header `Cf-Connecting-Ip` atau `Cf-Ray` → **403 `STAFF_LAN_ONLY`**, diperiksa sebelum apa pun. Penegakan LAN sebenarnya (gagal-tertutup) = backend Go, di luar rencana ini.
- **HPP tidak pernah ke staf:** respons `/api/staff/…` tidak memuat key `cost`, `costAlert`, `fromCost`, `oldCost`, `newCost`, `price`, `stock`, `grossProfit` di kedalaman mana pun. Pengecualian: `unitCost` (harga beli yang diketik) dan turunannya `subtotal`/`total` pada nota milik staf itu sendiri.
- Uang & `qtyBase` bilangan bulat (`Number.isSafeInteger`). `subtotal = qty × unitCost`; `qtyBase = qty × unitSize`. HPP tetap `ProductCost {amount, qtyBase}`; rumus di Task 2 (pakai persis).
- Tanggal kalender (`notaDate`, `dueDate`, `expiryDate`) = string ISO `YYYY-MM-DD` menurut kalender Asia/Jakarta; waktu kejadian = epoch ms UTC.
- "Mendekati jatuh tempo" = 0–3 hari sebelum jatuh tempo (termasuk hari H); lewat = setelah hari H. Tanpa pelunasan sebagian.
- Uang keluar laci: barang masuk `sekarang + tunai + laci`, pelunasan utang `tunai + laci`, dan koreksi dari ubah/batal nota yang dibayar dari laci → baris uang keluar di **shift yang sedang buka**; `expectedCash = openingCash + cashSales − supplierPayments`. Hitung buta kasir tidak berubah.
- Gaya §12b; app orang toko memakai nilai token pemilik lewat `:root[data-app="staff"]` (selektor yang sama dengan `data-app="owner"`). Tanda status = ikon lucide + teks. Tombol ≥ 44px, dialog/sheet Radix (`shared/ui/dialog`, `shared/ui/sheet`), label tombol spesifik.
- Fitur tidak saling import: `PinPad` dan scanner kamera dipindah ke `shared/components/` di task yang pertama membutuhkannya (Task 7, Task 9).
- Commit: conventional, Bahasa Indonesia, tanpa baris `Co-Authored-By` atau jejak alat lain.
- Teks UI (pakai persis; `{…}` diisi; `—` = em dash; `−` = U+2212 hanya di tempat yang ditulis `−`; **†** = teks pilihan rencana, tidak ada di spec/mockup):

| Kunci | Teks |
|---|---|
| login staf | merek `ShaziaMart · Stok`, keterangan `Masuk dengan akun kasir`; tombol nama (inisial + nama, `aria-pressed`) untuk tiap kasir; `Masukkan PIN {nama}`; PIN pad bersama (titik + `Hapus`); catatan dengan ikon Wifi `Hanya bisa dipakai di Wi-Fi toko`; galat lewat `pesanError` |
| kerangka staf | tab `Beranda` (House) · `Masuk` (Truck) · `Opname` (ClipboardCheck) · `Kedaluwarsa` (Hourglass) · `Lainnya` (Ellipsis); nav aria `Navigasi orang toko`†; judul besar per tab `Stok` · `Barang masuk` · `Stok opname`† · `Kedaluwarsa` · `Lainnya`; isi Opname/Kedaluwarsa `Segera hadir` |
| beranda staf | baris atas (ikon Wifi) `{nama} · Wi-Fi toko`, saat offline `{nama} · Tidak tersambung ke toko`†; judul `Stok`; tombol ikon aria `Akun` (→ Lainnya); kartu utama `Barang masuk` / `Catat nota supplier`; bila ada draf antre/ditolak: bagian `Belum terkirim ({n})`† berisi baris draf |
| lainnya staf | `Masuk sebagai {nama}`†; tombol `Keluar` |
| tab masuk | judul `Barang masuk`; tombol `Catat barang masuk`†; bagian `Belum terkirim`† · `Draf`† · `Terkirim`†; baris `{supplier}` (kosong: `Tanpa supplier`†) / `{d Mmm yyyy} · {n} barang`, kanan `{Rp}`; tanda `Belum terkirim` · `Perlu dibetulkan`† · `Dibatalkan`†; kosong `Belum ada barang masuk`† |
| nota | kiri `Batal`; judul `Barang masuk` + keterangan (ikon CloudCheck) `Draf tersimpan di HP`; bagian `Nota`: `Supplier`, `Tanggal nota`, foto: `1 lembar` / `Diambil {HH.MM} · {k} KB`, tanpa foto `Belum ada foto`†, tombol `Foto nota`; bagian `Barang` + `{n} baris`; baris `{nama}` / `{qty} {satuan} × {Rp}` + ` · ED {d Mmm yyyy}` bila ada, tanda `Barang baru`† untuk barang baru, kanan subtotal; `Tambah barang`; kaki `Total berjalan` `{Rp}`; tombol `Lanjut ke pembayaran` |
| batal nota | dialog `Buang draf ini?`† / `Draf barang masuk ini akan dihapus dari HP.`† / `Buang draf`† · `Simpan draf`† |
| lembar baris | judul `Tambah barang` / ubah `Ubah barang`†, keterangan `Isi sesuai yang tertulis di nota`, aria tutup `Tutup`; cari placeholder & label `Cari nama atau barcode`; tombol kamera aria `Scan barcode dengan kamera`; tanpa hasil `Tidak ada barang yang cocok` + tombol `Barang baru: {q}`†; terpilih `{nama}` / `{kategori}` + tombol `Ganti barang`†; `Satuan di nota` (segmented) `{eceran}` · `{besar} (isi {n})`; `Jumlah` + stepper aria `Kurangi jumlah`† / `Tambah jumlah`†, setara `= {qty} {eceran}` (hanya satuan besar); `Harga beli / {satuan}`; `Kedaluwarsa` + `opsional`; `Subtotal`; catatan `Isi tanggal ED bila ada di kemasan, agar muncul di daftar kedaluwarsa.`; tombol `Tambahkan ke nota` / ubah `Simpan baris`†; `Hapus baris`† |
| barang baru | bagian `Barang baru`†: `Nama`, `Dijual per`, `Satuan di nota`, `Isi` + keterangan `{eceran} per {satuan nota}`†, `Barcode` (+ kamera); catatan `Harga jual diisi pemilik. Barang ini belum bisa dijual di kasir sampai harga jual diisi.`† |
| pembayaran | bagian `Total`: `{n} barang` `{Rp}`; catatan `Sudah sama dengan total di nota? Kalau beda, periksa jumlah dan harga per baris.`; bagian `Pembayaran`: `Kapan dibayar` `Bayar sekarang` · `Bayar nanti`; `Cara bayar` `Tunai` · `Transfer`; `Uang dari` `Dari laci kasir` · `Uang pemilik`; catatan laci `Dicatat sebagai uang keluar di shift {kasir} (buka {HH.MM}). Di tutup shift muncul **Bayar supplier −{Rp}**.`; tanpa shift buka (baris `Uang dari` tidak tampil) `Tidak ada shift kasir yang buka — uang dicatat sebagai uang pemilik.`†; `Jatuh tempo` `{d Mmm yyyy}` + chip `7 hari` · `14 hari` · `30 hari`; catatan nanti `Nota masuk daftar **Utang supplier** di aplikasi pemilik. Cara bayar dipilih saat pemilik menandai lunas.`; tombol `Simpan barang masuk` / ubah `Simpan perubahan`†; ubah nota yang sudah dibayar: `Pembayaran` `{Bayar sekarang · Tunai · Dari laci kasir}` hanya-baca†; ubah saat offline: tombol nonaktif + `Perlu tersambung ke toko untuk menyimpan perubahan`† |
| kirim (toast) | `Barang masuk tersimpan`† · `Belum terkirim — dikirim otomatis saat tersambung`† · `Perlu dibetulkan — lihat pesan di baris`† · `Perubahan tersimpan`† |
| validasi nota | `Supplier belum diisi`† · `Tanggal nota belum diisi`† · `Tanggal nota tidak boleh setelah hari ini`† · `Belum ada barang di nota`† · `Pilih barang atau buat barang baru`† · `Barang tidak ditemukan`† · `Barang ini tidak dijual lagi` · `Satuan ini tidak dipakai lagi`† · `Jumlah minimal 1`† · `Harga beli belum diisi`† · `Harga beli: ketik angka saja, mis. 3500` · `Tanggal kedaluwarsa tidak valid`† · `Jatuh tempo belum diisi`† · `Jatuh tempo tidak boleh sebelum tanggal nota`† · `Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer`† · `Foto nota belum terkirim`† · `Foto nota terlalu besar (maks. 1 MB)`† · `Foto nota harus JPEG`† · `Cara bayar tidak bisa diubah — sudah dibayar`† · `Baris nota tidak cocok — muat ulang`†; barang baru: `Nama barang belum diisi` · `Nama sudah dipakai barang lain` · `Nama sama dengan baris lain` · `'Dijual per' belum diisi` · `Satuan di nota belum diisi`† · `Satuan besar: isi berapa? (min. 2)` · `Barcode salah, scan ulang` · `Barcode sudah dipakai: {nama}` · `Barcode sama dengan baris lain`† |
| tutup shift (kasir) | baris `Bayar supplier` `{formatRupiah(−supplierPayments)}` (keluar → `-Rp1.442.000`; bersih masuk → `+Rp…`) di atas `Uang seharusnya`; tidak tampil bila `supplierPayments = 0`† |
| lainnya pemilik | baris `Barang masuk`†, `Utang supplier` + kanan `{Rp belum dibayar}`†, lalu tombol `Keluar` |
| utang (9a) | kembali `Lainnya`; baris tanggal `{Hari, d Mmm}`; judul `Utang supplier`; kartu `Belum dibayar` `{Rp}` / `{n} nota · {k} supplier` + tanda (OctagonAlert) `{x} lewat jatuh tempo`; per supplier kepala `{supplier}` `{Rp}`; baris `Nota {d Mmm yyyy}` `{Rp}` / `Jatuh tempo {d Mmm} · {n} hari lagi` · `Jatuh tempo {d Mmm} · hari ini`† · lewat: `Jatuh tempo {d Mmm}` + tanda `Lewat jatuh tempo`; 0–3 hari: tanda (Clock, warning) `Segera jatuh tempo`†; bagian `Sudah lunas`† baris `Nota {d Mmm yyyy}` / `Lunas {d Mmm yyyy}`†; kosong `Tidak ada utang supplier`† |
| utang detail (9b) | kembali `Utang`; eyebrow `{supplier} · nota {d Mmm yyyy}`; judul `{Rp}`; baris foto `Foto nota` / `Dicatat {nama} · {relativeDayTime}`; `Jatuh tempo` `{d Mmm yyyy}`; tombol `Tandai lunas`; lembar `Tandai lunas` / `{supplier} · nota {d Mmm yyyy}`, aria tutup `Tutup`, `Nominal` `{Rp}`, `Cara bayar` `Tunai`·`Transfer`, `Uang dari` `Dari laci kasir`·`Uang pemilik`, catatan `"Dari laci kasir" dicatat sebagai uang keluar di shift yang sedang buka.`, tombol `Tandai lunas`; foto layar penuh: dialog `Foto nota`†, gambar alt `Foto nota` |
| barang masuk pemilik | judul `Barang masuk`; baris `{supplier}` / `{d Mmm yyyy} · {n} barang · {nama}` kanan `{Rp}` + tanda `Belum lunas`† / `Dibatalkan`†; detail: eyebrow `{supplier} · nota {d Mmm yyyy}`, judul `{Rp}`, kartu foto, bagian `Barang` (baris seperti nota), `Pembayaran` `{Bayar sekarang · Tunai · Dari laci kasir}` / `{Bayar nanti · jatuh tempo d Mmm yyyy}`†, `Status` `Belum lunas` / `Lunas {d Mmm yyyy}`†; bagian `Riwayat`† entri `Dicatat oleh {nama}` · `Diubah oleh {nama}` · `Dibatalkan oleh {nama}` · `Ditandai lunas oleh {nama}`† + `{relativeDayTime}` + baris perubahan; tombol `Batalkan nota`†; konfirmasi `Batalkan nota ini?`† / `Stok, HPP, dan utang nota ini dibalik. Tidak bisa diurungkan.`† / `Batalkan nota`† · `Kembali`† |
| perubahan (audit) | `{barang}: jumlah {qty satuan} → {qty satuan}` · `{barang}: harga beli {Rp} → {Rp}` · `{barang}: ED {d Mmm yyyy\|—} → {d Mmm yyyy\|—}` · `Supplier {a} → {b}` · `Tanggal nota {d Mmm yyyy} → {d Mmm yyyy}` · `Jatuh tempo {…} → {…}` · `Pembayaran {ringkas} → {ringkas}` · `Koreksi laci tidak dicatat — tidak ada shift buka` (semua †) |
| perhatian (baru) | `Utang supplier lewat jatuh tempo`† / `{n} nota · {Rp}` (kritis, ikon ReceiptText) · `Utang supplier segera jatuh tempo`† / `{n} nota · {Rp}` (peringatan) · `{n} barang baru dari barang masuk` / `Lengkapi harga jual` (peringatan, ikon PackagePlus; = teks spec dipisah judul/keterangan, K14) |
| barang menunggu | tanda (ikon `CircleDollarSign`, warning) `Menunggu harga jual`; chip `Menunggu harga jual {n}`†; harga di daftar & detail `—`†; kasir scan/kode → toast `Barang belum punya harga jual`; status 422 `Isi harga jual dulu`† |
| modal hanya-baca | isian `Harga modal` nonaktif + keterangan `Mengikuti barang masuk`†; catatan impor `Modal diabaikan — mengikuti barang masuk`† |
| riwayat stok | `Barang masuk {qty}` · `Koreksi barang masuk {qty}` · `Barang masuk dibatalkan {qty}` (†), keterangan `{waktu} · {nama}`, jumlah bertanda kanan (`+80`, `−40`) |
| lembar harga | sumber `… · lewat Barang masuk, {HH.MM}`† / `… · lewat ubah nota, {HH.MM}`† |
| galat (pesanError) | `STAFF_LAN_ONLY` `Hanya bisa dipakai di Wi-Fi toko` · `PRODUCT_NO_PRICE` `Barang belum punya harga jual` · `RECEIPT_CANCELLED` `Nota ini sudah dibatalkan`† · `DEBT_ALREADY_PAID` `Utang ini sudah lunas`† |

## Review Focus

1. **Respons hilang setelah server menyimpan** (Wi-Fi putus tepat setelah POST nota) → kirim ulang dengan ID yang sama mengembalikan nota tersimpan; stok, HPP, uang keluar laci, dan utang tercatat sekali. Dites di Task 4 (replay) dan Task 8 (handler MSW menyimpan lalu `HttpResponse.error()`).
2. **Draf offline kedaluwarsa saat dikirim** (barang dinonaktifkan, shift laci sudah tutup, nama barang baru sudah dibuat orang lain) → 422 dengan galat per baris/field, tidak ada perubahan sebagian (atomik), draf tetap ada berstatus `Perlu dibetulkan`, draf lain tetap terkirim. Dites di Task 4 dan Task 8.
3. **HP dipakai bergantian** (Rina menyimpan draf offline, keluar, Budi masuk) → draf Rina tidak tampil dan tidak dikirim atas nama Budi; terkirim saat Rina masuk lagi. Dites di Task 8.
4. **Ubah nota yang sama dua kali / baris tidak berubah** → tidak ada pergeseran HPP karena pembulatan, tidak ada baris koreksi stok nol, tidak ada entri audit kosong. Dites di Task 5.
5. **Stok sudah habis/minus saat nota diubah atau dibatalkan** (penyebut ≤ 0, nilai negatif) → HPP tidak pernah negatif atau tak hingga; aturan K4. Dites di Task 2 dan Task 5.

## Keputusan pembangun di rencana ini (tinjau)

- **K1 Rute & chunk:** app orang toko di `/staff` (lazy, chunk `staff-*`), `data-app="staff"` memakai nilai token pemilik. Tab `Masuk` = `/staff/masuk`; form baru `/staff/masuk/baru?draf={id}`, ubah `/staff/masuk/$receiptId`.
- **K2 Barang baru dari nota:** `ProductStatus` + `menunggu_harga`; semua satuannya `price: 0` sampai pemilik menyimpan form dengan harga jual → status `aktif` (riwayat harga mencatat `oldPrice: null`). Kasir: lookup → 410 `PRODUCT_NO_PRICE`, tidak muncul di pencarian/curah cepat. `PUT …/status` untuk barang menunggu → 422 `Isi harga jual dulu`. Barcode yang diisi staf melekat ke **satuan nota** (yang sedang dipegang).
- **K3 HPP saat terima** disimpan sebagai `{nilai stok Rp, qty}`: `amount = round_half_up(max(stok,0) × a ÷ q) + qty × harga`, `qtyBase = max(stok,0) + qtyMasuk`. HPP lama `null` atau stok ≤ 0 → HPP = harga beli terbaru.
- **K4 Ubah/batal** (rumus spec, `stok` = `max(stok,0)` seperti K3): penyebut ≤ 0 **atau nilai < 0** → ubah: HPP = harga baru; batal: HPP tetap. Baris yang jumlah & harganya tidak berubah dilewati.
- **K5 Ubah nota:** hanya oleh staf pembuatnya (pemilik: lihat + batalkan; ubah dari app pemilik ditunda). Baris tidak bisa ditambah/dihapus dan barang/satuannya tetap (salah barang → pemilik membatalkan, staf mencatat ulang). Ubah hanya online (tanpa draf). Pembayaran hanya bisa diubah selama `Bayar nanti` belum lunas.
- **K6 Koreksi laci saat tidak ada shift buka** tidak dicatat di shift mana pun; audit memuat `Koreksi laci tidak dicatat — tidak ada shift buka`.
- **K7 Stok belum dihitung:** butir "Detail dari review desain" yang menang atas baris "Barang masuk"/"Stok opname" — barang lama berlabel tetap belum terhitung setelah barang masuk; barang baru dari nota langsung terhitung. Tanda `Sedang langka` hilang saat barang masuk.
- **K8 Satuan nota** hanya dari satuan aktif barang yang terdaftar (mockup: Bimoli "dus" tidak ada di seed → test memakai `12 pcs × Rp34.000`, total tetap Rp1.442.000). `qty` bulat ≥ 1; `unitCost` bulat ≥ 0 (barang bonus).
- **K9 Jatuh tempo:** chip dihitung dari tanggal nota; `segera` = 0–3 hari, `lewat` < 0.
- **K10 Foto:** satu foto per nota (`1 lembar`), ID dari HP, `PUT` idempoten; server menerima JPEG ≤ 1 MB; HP mengompres ke ≤ 300 KB (algoritme Task 10). Server palsu menyimpan byte di localStorage `mock.photos` (base64), terpisah dari `mock.db`.
- **K11 Draf per pengguna:** draf menyimpan `userId`; hanya draf pengguna yang login yang tampil dan dikirim. Draf yang ditolak tidak dikirim ulang sampai pengguna menyimpan lagi.
- **K12 Kunci PIN** dibagi dengan kasir (`pinFailures` per akun): 5x salah di HP atau PC → terkunci 5 menit di keduanya. Hanya akun ber-`role: kasir` yang bisa masuk realm staf.
- **K13 Sumber perubahan modal:** `PriceSource` + `barang_masuk` (terima) dan `ubah_nota` (ubah/batal); butir "perubahan harga beli lewat edit" (§12e) disatukan dengan butir modal F3b-1 bersumber `ubah_nota`, bukan butir terpisah.
- **K14 Butir "barang baru"**: teks spec `{n} barang baru dari barang masuk — lengkapi harga jual` dipecah menjadi judul `{n} barang baru dari barang masuk` + keterangan `Lengkapi harga jual`; tautan `/owner/barang?menunggu=true`.
- **K15 Anggaran total bundle:** tambah anggaran `staff-` 50 KB. Bila `size:check` gagal **hanya** karena total > 220 KB, naikkan `TOTAL_MAX` ke 270 KB di commit tersendiri `chore(size): …` dengan alasan "tiga app terpisah; satu pengguna hanya memuat utama + satu app".
- **K16 Modal hanya-baca:** untuk barang yang punya barang masuk aktif, server mengabaikan modal dari form maupun impor (HPP tetap), bukan 422.
- **K17 Pencarian staf** satu endpoint: nama (mengandung, tanpa beda huruf), barcode atau kode toko persis; tanpa barang nonaktif; maks. 20.
- **K18 Letak menu pemilik:** Lainnya → `Barang masuk`, `Utang supplier` (sesuai mockup 9a).
- **K19 Header terowongan** (server palsu): `Cf-Connecting-Ip`, `Cf-Ray`; status 403, kode baru `STAFF_LAN_ONLY` (bukan `FORBIDDEN_ORIGIN`, yang untuk CSRF).

---

## Peta dependensi & paralelisme

```
T1 ─┬─> T2 ─┐
    └─> T3 ─┼─> T4 ─┬─> T5 ─┬─────────> T13 ─┐
            │       ├─> T6 ─┼─> T12 ─────────┤
            │       └─> T8 ─┤                ├─> T14
            ├─> T7 ─────────┼─> T10 ─> T11 ──┤
            └─> T9 (+T2) ───┘                │
```
| Gelombang | Task (worktree paralel) | Catatan konflik |
|---|---|---|
| 1 | T1 | — |
| 2 | T2 ∥ T3 | tidak berbagi file |
| 3 | T4 ∥ T7 ∥ T9 | tidak berbagi file (T7 router/kasir pin-pad/styles; T9 scanner owner→shared; T4 mocks) |
| 4 | T5 ∥ T6 ∥ T8 | T5 & T6 sama-sama menambah baris di `handlers/index.ts` dan ekspor di `receipts/views.ts` — gabung manual; T6 tidak memakai kode T5 |
| 5 | T10 ∥ T12 ∥ T13 | `router.tsx`: T10 blok staf, T12/T13 blok owner — gabung manual; `home-model.ts` hanya T12 |
| 6 | T11 | — |
| 7 | T14 | — |

Task risky (implementer Opus): T1–T8. UI (Sonnet): T9–T14. Tidak ada task mekanis murni: pemindahan `PinPad` dan scanner ke `shared/` dilipat ke task yang membutuhkannya (T7, T9). Semua task dapat review penuh.

---

### Task 1: Kontrak API realm orang toko, barang masuk, utang, dan shift

**Risk class:** risky (kontrak, auth, uang)

**Files:** Modify `api/openapi.yaml`; regenerate `web/src/shared/api/gen/**` (tag baru `staff` → `gen/staff/staff.ts`); Modify `web/src/shared/api/contract.test.ts`, `web/src/shared/lib/error-messages.ts` (+4), `error-messages.test.ts`, `web/src/shared/api/problem.ts` (+ `receiptProblemSchema`), `problem.test.ts`; isi sementara agar tetap hijau: `web/src/mocks/owner-summary.ts` (`supplierDebts` nol, `awaitingPriceCount: 0`), `web/src/mocks/handlers/shift.ts` & `web/src/mocks/history.ts` (`supplierPayments: 0`), `web/src/mocks/products/views.ts` (`hasReceipts: false`), fixture `Attention`/`ShiftClosure`/`OwnerProduct` di test yang memakainya.

**Interfaces — Produces.** Tag `staff`, `security: staffCookieAuth` (cookie `staff_session`) kecuali login & users; **semua** path `/api/staff/…` mendeklarasikan `"403": $ref LanOnly` dan deskripsi "header Cf-Connecting-Ip/Cf-Ray → 403 STAFF_LAN_ONLY; backend menolak semua yang bukan LAN (gagal-tertutup)". Semua yang ber-security mendeklarasikan 401.

| Method & path | operationId | Body | Sukses | Error |
|---|---|---|---|---|
| `GET /api/staff/users` | `listStaffUsers` | — | 200 `User[]` (role kasir) | 403 |
| `POST /api/staff/login` | `staffLogin` | `PinLoginRequest` | 200 `Session` (set `staff_session`) | 401 PIN_INVALID, 403, 422, 423 |
| `GET /api/staff/session` | `getStaffSession` | — | 200 `Session` | 401, 403 |
| `POST /api/staff/logout` | `staffLogout` | — | 204 (idempoten) | 403 |
| `GET /api/staff/shift` | `getStaffShift` | — | 200 `CurrentShift` | 401, 403 |
| `GET /api/staff/products?q=` | `searchStaffProducts` | — | 200 `StaffProduct[]` (maxItems 20) | 401, 403 |
| `GET /api/staff/suppliers` | `listStaffSuppliers` | — | 200 `Supplier[]` (terakhir dipakai dulu) | 401, 403 |
| `POST /api/staff/receipts` | `createStaffReceipt` | `ReceiptInput` | 201 `StaffReceipt`; 200 bila `id` sudah ada (replay, tanpa validasi ulang) | 401, 403, 422 `ReceiptProblem` |
| `GET /api/staff/receipts` | `listStaffReceipts` | — | 200 `StaffReceiptRow[]` (milik sendiri, terbaru dulu) | 401, 403 |
| `GET /api/staff/receipts/{receiptId}` | `getStaffReceipt` | — | 200 `StaffReceipt` | 401, 403, 404 (bukan milik sendiri juga 404) |
| `PUT /api/staff/receipts/{receiptId}` | `updateStaffReceipt` | `ReceiptEdit` | 200 `StaffReceipt` | 401, 403, 404, 409 `RECEIPT_CANCELLED`, 422 `ReceiptProblem` |
| `PUT /api/staff/receipt-photos/{photoId}` | `putStaffReceiptPhoto` | `image/jpeg` (`string`, `binary`) | 204 (idempoten) | 401, 403, 422 |
| `GET /api/staff/receipt-photos/{photoId}` | `getStaffReceiptPhoto` | — | 200 `image/jpeg` | 401, 403, 404 |
| `GET /api/owner/receipts` | `listOwnerReceipts` | — | 200 `OwnerReceiptRow[]` (terbaru dulu) | 401 |
| `GET /api/owner/receipts/{receiptId}` | `getOwnerReceipt` | — | 200 `OwnerReceipt` | 401, 404 |
| `POST /api/owner/receipts/{receiptId}/cancel` | `cancelOwnerReceipt` | — | 200 `OwnerReceipt` (idempoten) | 401, 404 |
| `GET /api/owner/receipt-photos/{photoId}` | `getOwnerReceiptPhoto` | — | 200 `image/jpeg` | 401, 404 |
| `GET /api/owner/supplier-debts` | `listOwnerSupplierDebts` | — | 200 `SupplierDebtList` | 401 |
| `POST /api/owner/supplier-debts/{receiptId}/pay` | `payOwnerSupplierDebt` | `PayDebtInput` | 200 `SupplierDebt` | 401, 404, 409 `DEBT_ALREADY_PAID`/`RECEIPT_CANCELLED`/`SHIFT_CLOSED`, 422 |

Skema (uang `integer`, waktu `integer int64` ms, tanggal `string format: date`):
- `ErrorCode` + `STAFF_LAN_ONLY`, `PRODUCT_NO_PRICE`, `RECEIPT_CANCELLED`, `DEBT_ALREADY_PAID` (20 nilai). Respons baru `LanOnly` (403), `ProductNoPrice` (410); `GET /api/catalog/lookup` + `410` deskripsi "PRODUCT_INACTIVE atau PRODUCT_NO_PRICE"; `searchCatalog`/`listQuickCurah` "tanpa barang nonaktif atau menunggu_harga".
- `ProductStatus` + `menunggu_harga` (deskripsi K2); `PriceSource` + `barang_masuk`, `ubah_nota`; `StockMovement.kind` + `masuk`, `koreksi_masuk`, `batal_masuk`, `kasirName` dideskripsikan "nama orang yang mencatat".
- `OwnerProduct` + wajib `hasReceipts: boolean` ("modal mengikuti barang masuk; isian modal diabaikan").
- `Attention` + wajib `supplierDebts: SupplierDebtAttention {overdueCount, overdueTotal, dueSoonCount, dueSoonTotal}` dan `awaitingPriceCount: integer`.
- `ShiftClosure` + wajib `supplierPayments: integer` ("Σ uang keluar ke supplier di shift ini, bertanda; expectedCash = openingCash + cashSales − supplierPayments").
- `StaffUnit {id, name, unitSize ≥ 1, barcodes: string[]}`; `StaffProduct {id, name, category (nullable), isCurah, baseUnit, status: ProductStatus, units: StaffUnit[]}` — tanpa harga, modal, stok.
- `Supplier {id, name}`.
- `ReceiptPayment {timing: enum [sekarang, nanti], method: enum [tunai, transfer] nullable, cashSource: enum [laci, pemilik] nullable, dueDate: date nullable}`.
- `NewProductInput {name (1–100), sellUnit (1–20), notaUnit (1–20), notaUnitSize: integer ≥ 1 (dalam satuan Dijual per), barcode: string nullable}`.
- `ReceiptLineInput {lineId (1–64), productId nullable, unitId nullable, newProduct: NewProductInput nullable, qty: integer ≥ 1, unitCost: integer ≥ 0, expiryDate: date nullable}`.
- `ReceiptInput {id (1–64), supplierName (1–100), notaDate, photoId nullable, lines: ReceiptLineInput[] (1–100), payment}`.
- `ReceiptLineEdit {lineId, qty ≥ 1, unitCost ≥ 0, expiryDate nullable}`; `ReceiptEdit {supplierName, notaDate, lines: ReceiptLineEdit[] (1–100), payment}`.
- `ReceiptStatus` enum `[aktif, dibatalkan]`; `ReceiptLine {lineId, productId, productName, unitId, unitName, unitSize, qty, unitCost, subtotal, expiryDate (nullable), newProduct: boolean}`.
- `StaffReceipt {id, supplierName, notaDate, photoId (nullable), lines, payment, paymentEditable: boolean ("Bayar nanti" yang belum dilunasi), total, status, createdAt, createdByName, editedAt (nullable), editedByName (nullable)}`; `StaffReceiptRow {id, supplierName, notaDate, total, lineCount, status, createdAt}`.
- `DebtPayment {at, method: enum [tunai, transfer], cashSource (nullable), byName}`; `ReceiptAuditAction` enum `[buat, ubah, batal, lunas]`; `ReceiptAuditEntry {id, at, actorName, action, changes: string[]}`.
- `OwnerReceiptRow {id, supplierName, notaDate, total, lineCount, status, payment, paid: DebtPayment (nullable), createdAt, createdByName, editedByName (nullable)}`; `OwnerReceipt` = `StaffReceipt` + `{paid (nullable), cancelledAt (nullable), audit: ReceiptAuditEntry[] (terlama dulu)}`.
- `SupplierDebt {receiptId, supplierName, notaDate, amount, dueDate, paid (nullable), photoId (nullable), createdAt, createdByName}`; `DrawerShift {kasirName, openedAt}`; `SupplierDebtList {debts: SupplierDebt[] (belum lunas urut jatuh tempo, lalu lunas terbaru dulu), drawerShift: DrawerShift (nullable)}`; `PayDebtInput {method: enum [tunai, transfer], cashSource: enum [laci, pemilik] nullable}`.
- `ReceiptField` enum `[supplierName, notaDate, lines, photoId, payment, dueDate, cashSource, product, unit, qty, unitCost, expiryDate, newName, newSellUnit, newNotaUnit, newNotaUnitSize, newBarcode]`; `ReceiptError {lineId (nullable), field, message}`; `ReceiptProblem` = `Problem` + `{code: [VALIDATION], errors: ReceiptError[]}`.
- `info.description`: tambah paragraf realm staf (staff_session, LAN-only, HPP tidak pernah ke staf kecuali `unitCost` nota sendiri).
- `error-messages.ts`: 4 pesan (tabel galat). `problem.ts`: `receiptProblemSchema: z.core.$ZodType<ReceiptProblem>`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("ErrorCode 20 nilai termasuk 4 kode baru", () => {
  expect(Object.values(ErrorCode)).toHaveLength(20);
  expect(Object.values(ErrorCode)).toEqual(expect.arrayContaining(["STAFF_LAN_ONLY", "PRODUCT_NO_PRICE", "RECEIPT_CANCELLED", "DEBT_ALREADY_PAID"]));
});
test("enum diperluas", () => {
  expect(Object.values(ProductStatus)).toEqual(["aktif", "tidak_diambil", "nonaktif", "menunggu_harga"]);
  expect(Object.values(PriceSource)).toEqual(["pemilik", "impor", "barang_masuk", "ubah_nota"]);
  expectTypeOf<StockMovement["kind"]>().toEqualTypeOf<"jual" | "batal" | "masuk" | "koreksi_masuk" | "batal_masuk">();
});
test("StaffProduct & StaffUnit tanpa harga, modal, stok", () => {
  expectTypeOf<keyof StaffProduct>().toEqualTypeOf<"id" | "name" | "category" | "isCurah" | "baseUnit" | "status" | "units">();
  expectTypeOf<keyof StaffUnit>().toEqualTypeOf<"id" | "name" | "unitSize" | "barcodes">();
  expectTypeOf<keyof ReceiptLine>().not.toEqualTypeOf<"cost">();
});
test("CreateStaffReceiptBody menerima nota mockup; menolak qty 0, unitCost −1, lines kosong", () => {
  const nota = { id: "r1", supplierName: "CV Sumber Rejeki", notaDate: "2026-11-02", photoId: null,
    lines: [{ lineId: "l1", productId: "p1", unitId: "u2", newProduct: null, qty: 2, unitCost: 112000, expiryDate: "2027-04-20" }],
    payment: { timing: "sekarang", method: "tunai", cashSource: "laci", dueDate: null } };
  expect(CreateStaffReceiptBody.safeParse(nota).success).toBe(true);
  expect(CreateStaffReceiptBody.safeParse({ ...nota, lines: [] }).success).toBe(false);
  expect(CreateStaffReceiptBody.safeParse({ ...nota, lines: [{ ...nota.lines[0], qty: 0 }] }).success).toBe(false);
  expect(CreateStaffReceiptBody.safeParse({ ...nota, lines: [{ ...nota.lines[0], unitCost: -1 }] }).success).toBe(false);
});
test("ShiftClosure.supplierPayments, Attention.supplierDebts/awaitingPriceCount, OwnerProduct.hasReceipts", () => {
  expectTypeOf<ShiftClosure["supplierPayments"]>().toEqualTypeOf<number>();
  expectTypeOf<Attention["supplierDebts"]>().toEqualTypeOf<SupplierDebtAttention>();
  expectTypeOf<Attention["awaitingPriceCount"]>().toEqualTypeOf<number>();
  expectTypeOf<OwnerProduct["hasReceipts"]>().toEqualTypeOf<boolean>();
});
// error-messages.test.ts
test.each([["STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"], ["PRODUCT_NO_PRICE", "Barang belum punya harga jual"],
  ["RECEIPT_CANCELLED", "Nota ini sudah dibatalkan"], ["DEBT_ALREADY_PAID", "Utang ini sudah lunas"]])("pesanError %s", (code, text) =>
  expect(pesanError(new ApiError({ status: 403, code }))).toBe(text));
// problem.test.ts
test("receiptProblemSchema membaca errors per baris", () => expect(readProblem(receiptProblemSchema, body)?.errors[0])
  .toEqual({ lineId: "l2", field: "product", message: "Barang ini tidak dijual lagi" }));
```
- [ ] **Step 2:** `npx vitest run src/shared` → FAIL (tipe/ekspor belum ada).
- [ ] **Step 3:** tulis kontrak; `npm run gen`; isi nilai sementara di mock & fixture (daftar Files); tambah pesan & skema problem.
- [ ] **Step 4:** `npm run gen:check && npm run typecheck && npm test` → hijau.
- [ ] **Step 5:** commit `feat(api): kontrak realm orang toko, barang masuk, utang supplier, dan uang keluar shift`.

---

### Task 2: Aturan murni — total, pembayaran, validasi nota, tanggal, dan HPP

**Risk class:** risky (uang, HPP)

**Files:** Create `web/src/shared/lib/receipt-rules.ts` (+ test), `web/src/mocks/receipts/hpp.ts` (+ test); Modify `web/src/shared/lib/business-day.ts` (+ test).

**Interfaces — Consumes:** gen `ProductCost`, `ReceiptPayment`, `NewProductInput`, `ReceiptError`, `ReceiptField`; `roundHalfUp`, `isValidBarcode`, `sellUnitKind`. **Produces:**
```ts
// business-day.ts — tanggal ISO kalender Asia/Jakarta
export function jakartaIsoDate(ms: number): string;                 // "2026-11-02"
export function isIsoDate(s: string): boolean;                      // tanggal kalender sah
export function addIsoDays(iso: string, days: number): string;
export function isoDaysBetween(from: string, to: string): number;   // to − from, hari
export function formatIsoDate(iso: string): string;                 // "2 Nov 2026"
export function formatIsoDayMonth(iso: string): string;             // "2 Nov"
// receipt-rules.ts
export const DUE_SOON_DAYS = 3;
export type DebtStage = "lewat" | "segera" | "nanti";
export function debtStage(dueDate: string, today: string): DebtStage;
export function receiptLineTotal(qty: number, unitCost: number): number;   // RangeError bila hasil bukan safe integer
export function receiptTotal(lines: readonly { qty: number; unitCost: number }[]): number;
export type CheckLine = { lineId: string; productId: string | null; unitId: string | null;
  newProduct: NewProductInput | null; qty: number | null; unitCost: number | null; expiryDate: string | null };
export type CheckReceipt = { supplierName: string; notaDate: string; lines: CheckLine[]; payment: ReceiptPayment };
export function validateReceipt(r: CheckReceipt, ctx: { today: string; shiftOpen: boolean }): ReceiptError[];
export function validatePayment(p: ReceiptPayment, notaDate: string, shiftOpen: boolean): ReceiptError[];
export function newProductUnits(n: NewProductInput): { eceran: { name: string; unitSize: number }; nota: { name: string; unitSize: number } | null } | null; // null bila sellUnit kosong
// mocks/receipts/hpp.ts
export function receiveCost(prev: ProductCost | null, stockBefore: number, qtyIn: number, lineCost: number): ProductCost;
export function reviseCost(current: ProductCost | null, stock: number,
  old: { qtyBase: number; cost: number }, next: { qtyBase: number; cost: number } | null): ProductCost | null; // next null = batal
```
`validateReceipt` berurutan: supplier kosong (trim) · `notaDate` kosong/tidak sah · `notaDate > today` · `lines` kosong (`lines`, `lineId: null`) · per baris: tanpa `productId` dan tanpa `newProduct` (`product` `Pilih barang atau buat barang baru`), `productId` tanpa `unitId` (`unit` `Satuan ini tidak dipakai lagi`), barang baru (nama kosong, `sellUnit` kosong, `notaUnit` kosong, `notaUnit` ≠ `sellUnit` (tanpa beda huruf) dan `notaUnitSize < 2` → `newNotaUnitSize` `Satuan besar: isi berapa? (min. 2)`, barcode tidak valid, nama sama dengan barang baru di baris lain → `Nama sama dengan baris lain`, barcode sama di baris lain → `Barcode sama dengan baris lain`), `qty` null/< 1, `unitCost` null, `expiryDate` tidak sah · lalu `validatePayment`. `validatePayment`: `nanti` → `dueDate` wajib & ≥ `notaDate`, `method`/`cashSource` harus null; `sekarang` → `method` wajib; `tunai` → `cashSource` wajib; `tunai + laci` dan `!shiftOpen` → `cashSource` `Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer`; `transfer` → `cashSource` null. `newProductUnits`: eceran = `{sellUnit, sellUnitKind(sellUnit).unitSize}`; `notaUnit` sama (tanpa beda huruf) → `nota: null`; selain itu `{notaUnit, notaUnitSize × eceran.unitSize}`.

HPP (pakai persis; tes mematok angka tetapi bukan semua cabang):
```ts
// K3
const s = Math.max(stockBefore, 0);
if (prev === null || s === 0) return { amount: lineCost, qtyBase: qtyIn };
return { amount: roundHalfUp(s * prev.amount, prev.qtyBase) + lineCost, qtyBase: s + qtyIn };
// K4 — reviseCost
const s = Math.max(stock, 0);
const nq = next?.qtyBase ?? 0, nc = next?.cost ?? 0;
if (next && old.qtyBase === nq && old.cost === nc) return current;          // baris tidak berubah
const value = current === null ? null : roundHalfUp(s * current.amount, current.qtyBase) - old.cost + nc;
const qty = s - old.qtyBase + nq;
if (value === null || qty <= 0 || value < 0) return next ? { amount: nc, qtyBase: nq } : current;
return { amount: value, qtyBase: qty };
```

- [ ] **Step 1: Tulis test yang gagal**

```ts
// business-day.test.ts
test("tanggal ISO WIB", () => {
  expect(jakartaIsoDate(Date.UTC(2026, 10, 1, 17, 30))).toBe("2026-11-02");   // 00.30 WIB
  expect(addIsoDays("2026-11-02", 14)).toBe("2026-11-16");
  expect(addIsoDays("2026-12-25", 7)).toBe("2027-01-01");
  expect(isoDaysBetween("2026-11-02", "2026-11-11")).toBe(9);
  expect(isoDaysBetween("2026-11-02", "2026-10-30")).toBe(-3);
  expect(formatIsoDate("2027-04-20")).toBe("20 Apr 2027");
  expect(formatIsoDayMonth("2026-10-30")).toBe("30 Okt");
  expect(isIsoDate("2026-02-30")).toBe(false); expect(isIsoDate("2026-11-02")).toBe(true);
});
// receipt-rules.test.ts
test.each([["2026-10-30", "lewat"], ["2026-11-01", "lewat"], ["2026-11-02", "segera"], ["2026-11-05", "segera"], ["2026-11-06", "nanti"], ["2026-11-16", "nanti"]])(
  "debtStage(%s) pada 2 Nov 2026 = %s", (due, stage) => expect(debtStage(due, "2026-11-02")).toBe(stage));
test("total nota mockup = Rp1.442.000", () => {
  expect(receiptLineTotal(2, 112000)).toBe(224000);
  expect(receiptTotal([{ qty: 2, unitCost: 112000 }, { qty: 12, unitCost: 34000 }, { qty: 50, unitCost: 16200 }])).toBe(1442000);
  expect(() => receiptLineTotal(2 ** 40, 2 ** 20)).toThrow(RangeError);
});
test.each([
  [{ supplierName: " " }, null, "supplierName", "Supplier belum diisi"],
  [{ notaDate: "2026-11-03" }, null, "notaDate", "Tanggal nota tidak boleh setelah hari ini"],
  [{ lines: [] }, null, "lines", "Belum ada barang di nota"],
  [{ lines: [line({ productId: null })] }, "l1", "product", "Pilih barang atau buat barang baru"],
  [{ lines: [line({ qty: 0 })] }, "l1", "qty", "Jumlah minimal 1"],
  [{ lines: [line({ unitCost: null })] }, "l1", "unitCost", "Harga beli belum diisi"],
  [{ lines: [line({ expiryDate: "2027-02-30" })] }, "l1", "expiryDate", "Tanggal kedaluwarsa tidak valid"],
  [{ lines: [newLine({ notaUnit: "dus", notaUnitSize: 1 })] }, "l1", "newNotaUnitSize", "Satuan besar: isi berapa? (min. 2)"],
  [{ lines: [newLine({ barcode: "123" })] }, "l1", "newBarcode", "Barcode salah, scan ulang"],
  [{ lines: [newLine({}, "l1"), newLine({}, "l2")] }, "l2", "newName", "Nama sama dengan baris lain"],
  [{ payment: { timing: "nanti", method: null, cashSource: null, dueDate: null } }, null, "dueDate", "Jatuh tempo belum diisi"],
  [{ payment: { timing: "nanti", method: null, cashSource: null, dueDate: "2026-11-01" } }, null, "dueDate", "Jatuh tempo tidak boleh sebelum tanggal nota"],
])("validateReceipt %o → %s/%s: %s", (patch, lineId, field, message) =>
  expect(validateReceipt(receipt(patch), { today: "2026-11-02", shiftOpen: true })).toContainEqual({ lineId, field, message }));
test("tunai dari laci tanpa shift buka → galat cashSource; transfer lolos", () => {
  expect(validatePayment({ timing: "sekarang", method: "tunai", cashSource: "laci", dueDate: null }, "2026-11-02", false))
    .toEqual([{ lineId: null, field: "cashSource", message: "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer" }]);
  expect(validatePayment({ timing: "sekarang", method: "transfer", cashSource: null, dueDate: null }, "2026-11-02", false)).toEqual([]);
});
test("newProductUnits", () => {
  expect(newProductUnits({ name: "Teh Botol Sosro 450 ml", sellUnit: "botol", notaUnit: "dus", notaUnitSize: 24, barcode: null }))
    .toEqual({ eceran: { name: "botol", unitSize: 1 }, nota: { name: "dus", unitSize: 24 } });
  expect(newProductUnits({ name: "Beras Cianjur", sellUnit: "kg", notaUnit: "karung", notaUnitSize: 25, barcode: null }))
    .toEqual({ eceran: { name: "kg", unitSize: 1000 }, nota: { name: "karung", unitSize: 25000 } });
  expect(newProductUnits({ name: "X", sellUnit: "pcs", notaUnit: "PCS", notaUnitSize: 1, barcode: null })?.nota).toBeNull();
});
// mocks/receipts/hpp.test.ts — Indomie HPP {104000,40} = Rp2.600/pcs
test("receiveCost: stok 60, masuk 2 dus × Rp112.000 → {380000,140} (Rp2.714/pcs)", () => {
  const c = receiveCost({ amount: 104000, qtyBase: 40 }, 60, 80, 224000);
  expect(c).toEqual({ amount: 380000, qtyBase: 140 }); expect(unitCost(c, 1)).toBe(2714);
});
test("receiveCost: Gula {16500,1000} stok 20 kg, masuk 50 kg × Rp16.200 → {1140000,70000} (Rp16.286/kg)", () => {
  const c = receiveCost({ amount: 16500, qtyBase: 1000 }, 20000, 50000, 810000);
  expect(c).toEqual({ amount: 1140000, qtyBase: 70000 }); expect(unitCost(c, 1000)).toBe(16286);
});
test("receiveCost: stok −2 atau 0 → harga terbaru; HPP null → harga terbaru", () => {
  expect(receiveCost({ amount: 36000, qtyBase: 1 }, -2, 12, 408000)).toEqual({ amount: 408000, qtyBase: 12 });
  expect(receiveCost(null, 50, 10, 30000)).toEqual({ amount: 30000, qtyBase: 10 });
});
const H = { amount: 380000, qtyBase: 140 }, OLD = { qtyBase: 80, cost: 224000 };
test.each([
  ["ubah harga 112.000→108.000, stok 120", 120, { qtyBase: 80, cost: 216000 }, { amount: 317714, qtyBase: 120 }, 2648],
  ["ubah jumlah 2→1 dus, stok 120", 120, { qtyBase: 40, cost: 112000 }, { amount: 213714, qtyBase: 80 }, 2671],
  ["batal, stok 120", 120, null, { amount: 101714, qtyBase: 40 }, 2543],
  ["ubah 2→1 dus, stok 30 (penyebut −10) → harga baru", 30, { qtyBase: 40, cost: 112000 }, { amount: 112000, qtyBase: 40 }, 2800],
  ["batal, stok 70 (penyebut −10) → HPP tetap", 70, null, H, 2714],
])("reviseCost %s", (_, stock, next, cost, perPcs) => {
  const c = reviseCost(H, stock, OLD, next);
  expect(c).toEqual(cost); expect(unitCost(c, 1)).toBe(perPcs);
});
test("reviseCost: nilai negatif → batal HPP tetap; baris tidak berubah → objek sama", () => {
  expect(reviseCost({ amount: 100000, qtyBase: 100 }, 100, { qtyBase: 50, cost: 125000 }, null)).toEqual({ amount: 100000, qtyBase: 100 });
  expect(reviseCost(H, 120, OLD, { qtyBase: 80, cost: 224000 })).toBe(H);
});
```
(`receipt(patch)` = nota valid minimal `{supplierName: "CV Sumber Rejeki", notaDate: "2026-11-02", lines: [line()], payment: sekarang/transfer}`; `line()` = baris barang terdaftar `l1` qty 1 harga 1000; `newLine(patch, id)` = barang baru `Teh Botol Sosro 450 ml`/`botol`/`botol`/1.)
- [ ] **Step 2:** `npx vitest run src/shared/lib src/mocks/receipts` → FAIL.
- [ ] **Step 3:** implementasi (rumus HPP persis di atas).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(lib): aturan nota barang masuk, jatuh tempo, dan HPP rata-rata tertimbang`.

---

### Task 3: State palsu v5, realm orang toko, katalog staf, dan supplier

**Risk class:** risky (auth, kontrak server)

**Files:** Modify `web/src/mocks/db.ts`, `seed-data.ts`, `handlers/respond.ts`, `handlers/index.ts`, `products/views.ts`, `handlers/test-helpers.ts`; Create `web/src/mocks/handlers/staff-realm.ts`, `handlers/staff.ts`; Tests `db.test.ts`, `handlers/staff.test.ts`.

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
// db.ts
export type MockSupplier = Supplier & { lastUsedAt: number };
export type MockReceipt = { id: string; supplierId: string; notaDate: string; photoId: string | null; lines: ReceiptLine[];
  payment: ReceiptPayment; paid: DebtPayment | null; status: ReceiptStatus; createdById: string; createdByName: string;
  createdAt: number; editedByName: string | null; editedAt: number | null; cancelledAt: number | null };
export type MockAuditEntry = ReceiptAuditEntry & { receiptId: string };
export type MockStockEntry = { id: string; productId: string; receiptId: string; at: number;
  kind: "masuk" | "koreksi_masuk" | "batal_masuk"; qtyBase: number; actorName: string };
export type MockCashOut = { id: string; at: number; amount: number; receiptId: string; kind: "bayar" | "koreksi" | "lunas" };
export type MockShift = Shift & { cashSales: number; salesCount: number; cashOuts: MockCashOut[] };
MockState: version: 5; staffSession: { userId: string } | null; suppliers: MockSupplier[]; receipts: MockReceipt[];
           receiptAudit: MockAuditEntry[]; stockEntries: MockStockEntry[];   // semuanya append-only kecuali receipts (status/paid/edit)
// handlers/staff-realm.ts
export const TUNNEL_HEADERS = ["cf-connecting-ip", "cf-ray"] as const;
export function staffRealm<R extends HttpResponseResolver>(resolver: R): R; // 403 STAFF_LAN_ONLY dulu, lalu withScenario(resolver)
export function requireStaffSession(state: Readonly<MockState>): MockUser | Response; // role kasir; 401 "Sesi orang toko tidak ditemukan"
// products/views.ts
export function toStaffProduct(p: MockProduct): StaffProduct;      // satuan aktif saja
export function searchStaffProducts(state: Readonly<MockState>, q: string): StaffProduct[]; // K17
// test-helpers.ts
export const staffLogin: (name?: string, pin?: string) => Promise<Response>;   // default Rina/123456
export function put(path: string, body: unknown, headers?: Record<string, string>): Promise<Response>;
export function get(path: string, headers?: Record<string, string>): Promise<Response>;
export const FORBIDDEN_STAFF_KEYS: readonly string[];  // daftar Global Constraints
export function deepKeys(value: unknown): Set<string>;
```
- `isState` memeriksa `version === 5` dan array/objek baru; v4 → reseed. `createSeedState`: `staffSession: null`, empat koleksi kosong; tidak ada nota seed.
- `staff.ts`: users (kasir saja, `toUser`), login (aturan & kunci sama dengan `/api/auth/pin-login`, memakai `state.pinFailures` bersama — K12; pengguna `pemilik` → 401 `PIN_INVALID`), session, logout (`staffSession = null` saja), shift (`CurrentShift`), products (`searchStaffProducts`), suppliers (urut `lastUsedAt` turun, tanpa `lastUsedAt`). Semua dibungkus `staffRealm`.
- `searchStaffProducts`: `q.trim()` < 2 karakter dan bukan angka → `[]`; buang status `nonaktif`; cocok bila nama mengandung `q` (tanpa beda huruf) atau `q` = barcode satuan aktif atau `storeCode`; urut nama `localeCompare("id")`; maks. 20.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("state v4 di localStorage → reseed v5 dengan staffSession null dan koleksi nota kosong", () => {});
test("login staf Rina 123456 → 200 {user:{name:'Rina', role:'kasir'}}; state.session (kasir) & ownerSession tetap null", async () => {});
test("logout staf tidak menghapus sesi kasir maupun pemilik; login kasir tidak membuat sesi staf", async () => {});
test("users staf: Rina & Budi saja; Pak Ahmad PIN 999999 → 401 PIN_INVALID", async () => {});
test("kunci bersama: 4x salah di /api/staff/login + 1x salah di /api/auth/pin-login → 423 di keduanya", async () => {});
test.each(TUNNEL_HEADERS)("header %s → 403 STAFF_LAN_ONLY di semua endpoint staf, termasuk login dan dengan sesi sah", async (h) => {
  // GET users, POST login, GET session, POST logout, GET shift, GET products?q=indomie, GET suppliers,
  // POST/GET receipts, GET/PUT receipts/x, PUT/GET receipt-photos/x → semuanya {status:403, code:'STAFF_LAN_ONLY'}
});
test("tanpa sesi staf → 401 walau sesi kasir & pemilik aktif", async () => {});
test("shift: tanpa shift → {shift:null}; Rina buka shift 1.500.000 → {shift:{kasirName:'Rina', openingCash:1500000}}", async () => {});
test("cari: 'indomie' → Indomie {category:'Mi Instan', status:'aktif', units:[{name:'pcs',unitSize:1,barcodes:['089686010947']},{name:'dus',unitSize:40,barcodes:['189686010944']}]}", async () => {});
test("cari: '089686010947' & '1001' → Indomie; 'i' → []; Bimoli nonaktif → 'bimoli' []; satuan nonaktif dibuang; maks 20", async () => {});
test("respons staf tidak memuat FORBIDDEN_STAFF_KEYS (deepKeys) — users, session, shift, products, suppliers", async () => {});
test("suppliers awal []", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): state v5 dan realm orang toko dengan penolakan header terowongan`.

---

### Task 4: Server palsu — terima barang masuk dan foto nota

**Risk class:** risky (uang, HPP, idempotensi, aturan server)

**Files:** Create `web/src/mocks/receipts/receive.ts` (+ test), `receipts/cash.ts`, `receipts/views.ts`, `web/src/mocks/photos.ts`, `handlers/staff-receipts.ts` (+ test `handlers/staff-receipts.test.ts`); Modify `products/cost-alert.ts` (pindahkan `updateCostAlert` dari `apply.ts` menjadi `noteCostChange`), `products/apply.ts`, `products/views.ts` (`movementsOf` menggabungkan `stockEntries`), `db.ts` (`mockDb.reset` juga `mockPhotos.reset`), `handlers/index.ts`, `handlers/test-helpers.ts` (`receiptInput`, `jpegBytes`).

**Interfaces — Consumes:** Task 2 (`validateReceipt`, `newProductUnits`, `receiptTotal`, `receiveCost`, `jakartaIsoDate`), Task 3. **Produces:**
```ts
// products/cost-alert.ts
export function noteCostChange(state: MockState, prev: MockProduct, next: ProductCost | null, source: PriceSource, now: number): void; // aturan F3b-1 persis
// receipts/cash.ts
export function laciPaid(r: MockReceipt): number;   // total bila (sekarang|lunas) & tunai & laci, selain itu 0
export function addCashOut(state: MockState, amount: number, receiptId: string, kind: MockCashOut["kind"], now: number): boolean; // false bila tidak ada shift; amount 0 → tidak ditulis, true
export const supplierPaymentsOf: (shift: MockShift) => number;  // Σ amount
// receipts/receive.ts
export function checkReceipt(state: Readonly<MockState>, input: ReceiptInput, now: number): ReceiptError[];
export function applyReceipt(state: MockState, input: ReceiptInput, user: MockUser, now: number): MockReceipt; // memutasi; anggap sudah dicek
export function upsertSupplier(state: MockState, name: string, now: number): MockSupplier; // key = trim+lowercase, ejaan pertama dipertahankan
// receipts/views.ts
export const receiptTotalOf: (r: MockReceipt) => number;
export function toStaffReceipt(state: Readonly<MockState>, r: MockReceipt): StaffReceipt; // paymentEditable = aktif & nanti & paid null
export function toStaffReceiptRow(state: Readonly<MockState>, r: MockReceipt): StaffReceiptRow;
// photos.ts — localStorage "mock.photos" (base64); quota penuh → abaikan
export const mockPhotos: { save(id: string, bytes: Uint8Array): void; load(id: string): Uint8Array | undefined; has(id: string): boolean; reset(): void };
// test-helpers.ts
export function receiptInput(patch?: Partial<ReceiptInput>): ReceiptInput;  // nota mockup (lihat test)
export const jpegBytes: (size: number) => Uint8Array;   // diawali FF D8 FF
```
`checkReceipt` = `validateReceipt(input, { today: jakartaIsoDate(now), shiftOpen: state.shift !== null })` + aturan server per baris: barang tidak ada → `product` `Barang tidak ditemukan`; `nonaktif` → `product` `Barang ini tidak dijual lagi`; `unitId` bukan satuan aktif barang itu → `unit` `Satuan ini tidak dipakai lagi`; barang baru: nama bentrok (`key` dari `products/checks.ts`) → `newName` `Nama sudah dipakai barang lain`, barcode milik satuan mana pun (termasuk nonaktif) → `newBarcode` `Barcode sudah dipakai: {nama}`; `photoId` tidak ada di `mockPhotos` → `photoId` `Foto nota belum terkirim`.

`applyReceipt` (satu `mockDb.update`, urut baris): barang baru → `buildProduct`-gaya F3b-1 (`storeCode` maks+1, `category: null`, `status: "menunggu_harga"`, `scarce: false`, `stockCounted: true`, satuan dari `newProductUnits` dengan `price: 0`, `wholesaleTiers: []`, barcode di satuan nota (K2), `minStock` tidak ada, `cost: null`, stok 0); lalu untuk setiap baris: `qtyIn = qty × unitSize`, `cost = receiveCost(p.cost, stock, qtyIn, qty × unitCost)`; `noteCostChange(state, p, cost, "barang_masuk", now)` bila `p.cost !== null` dan rasio berubah; `p.cost = cost`; `p.scarce = false`; `stock += qtyIn`; `stockEntries` + `{kind: "masuk", qtyBase: qtyIn, actorName: user.name}`. `ReceiptLine.productName/unitName/unitSize` = salinan saat itu, `newProduct` = dibuat dari baris ini. Supplier di-upsert; audit `{action: "buat", changes: []}`; `addCashOut(total, "bayar")` bila `sekarang + tunai + laci`.

Handler (`staffRealm`, `requireStaffSession` dulu): POST — `id` sudah ada → 200 nota tersimpan (milik siapa pun); `checkReceipt` → 422 `ReceiptProblem` semua galat, state tidak berubah; sukses 201. GET daftar/detail: hanya `createdById === user.id`. PUT foto: `await request.arrayBuffer()`; > 1 MB → 422 `Foto nota terlalu besar (maks. 1 MB)`; tidak diawali `FF D8 FF` → 422 `Foto nota harus JPEG`; simpan; 204. GET foto (staf & pemilik — handler pemilik di file yang sama): 200 `image/jpeg` atau 404.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// beforeEach: staffLogin(); kasir Rina buka shift 1.500.000; stok Indomie 60, Bimoli 4 (cost {34000,1}), Gula 20000 g
// receiptInput() = CV Sumber Rejeki, 2026-11-02, Indomie 2 dus × 112.000 ED 2027-04-20 (l1), Bimoli 12 pcs × 34.000 (l2), Gula 50 kg × 16.200 (l3), sekarang/tunai/laci
test("nota mockup → 201 total 1442000; stok 140 / 16 / 70000; HPP Indomie {380000,140}, Gula {1140000,70000}, Bimoli tetap {34000,1}", async () => {});
test("butir modal: Indomie fromCost {104000,40} & Gula {16500,1000} bersumber barang_masuk; Bimoli tanpa butir", async () => {});
test("uang keluar: shift.cashOuts = [{amount:1442000, kind:'bayar'}]; supplier 'CV Sumber Rejeki' tercatat", async () => {});
test("kirim ulang id sama → 200 nota yang sama; stok Indomie tetap 140; tetap satu cashOut dan satu audit 'buat'", async () => {});
test("mutasi Indomie[0] = {kind:'masuk', qtyBase:80, kasirName:'Rina'}", async () => {});
test("Sedang langka dihapus; barang 'Stok belum dihitung' tetap stockCounted false setelah barang masuk", async () => {});
test("stok −2 → HPP {408000,12}; HPP null → {30000,10} tanpa butir modal", async () => {});
test("barang baru Teh Botol Sosro 450 ml (botol, dus isi 24, 8996001600269) 2 dus × 96.000", async () => {
  // product {status:'menunggu_harga', storeCode:'2006', stockCounted:true, category:null, cost:{192000,48}}, stok 48,
  // units [{name:'botol',unitSize:1,price:0,barcodes:[]},{name:'dus',unitSize:24,price:0,barcodes:['8996001600269']}], line.newProduct true, costAlerts tanpa entri
});
test("Bimoli nonaktif → 422 errors [{lineId:'l2', field:'product', message:'Barang ini tidak dijual lagi'}]; stok Indomie tetap 60; tanpa nota, supplier, cashOut", async () => {});
test("laci tanpa shift → 422 [{lineId:null, field:'cashSource', message:'Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer'}]", async () => {});
test("barang baru ' indomie goreng ' → newName 'Nama sudah dipakai barang lain'; barcode 089686010947 → newBarcode 'Barcode sudah dipakai: Indomie Goreng'", async () => {});
test("Bayar nanti jatuh tempo 2026-11-16 → tanpa cashOut; payment tersimpan", async () => {});
test("foto: PUT 200 KB JPEG → 204; GET staf & pemilik mengembalikan byte sama (image/jpeg); 1,1 MB → 422; PNG → 422; tanpa sesi → 401", async () => {});
test("photoId belum di-PUT → 422 photoId 'Foto nota belum terkirim'", async () => {});
test("daftar & detail: Rina melihat notanya (unitCost 112000); Budi → [] dan GET nota Rina → 404", async () => {});
test("respons nota staf tidak memuat FORBIDDEN_STAFF_KEYS", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi (test F3b-1 `apply.test.ts`/`owner-products.test.ts` tetap hijau setelah `noteCostChange` dipindah). **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): terima barang masuk dengan HPP rata-rata tertimbang, foto nota, dan kirim ulang idempoten`.

---

### Task 5: Server palsu — ubah & batalkan nota, jejak audit, nota di app pemilik

**Risk class:** risky (HPP, uang, aturan server)

**Files:** Create `web/src/mocks/receipts/revise.ts` (+ test), `receipts/audit.ts` (+ test), `handlers/owner-receipts.ts` (+ test); Modify `handlers/staff-receipts.ts` (PUT), `receipts/views.ts` (`toOwnerReceipt`, `toOwnerReceiptRow`), `handlers/index.ts`.

**Interfaces — Consumes:** Task 2 `reviseCost`, `validatePayment`, `receiptTotal`; Task 4 `noteCostChange`, `laciPaid`, `addCashOut`, `upsertSupplier`. **Produces:**
```ts
// receipts/revise.ts
export function checkEdit(state: Readonly<MockState>, r: MockReceipt, edit: ReceiptEdit, now: number): ReceiptError[];
export function applyEdit(state: MockState, r: MockReceipt, edit: ReceiptEdit, actor: MockUser, now: number): void;
export function applyCancel(state: MockState, r: MockReceipt, actor: MockUser, now: number): void;
// receipts/audit.ts
export function editChanges(before: MockReceipt, after: MockReceipt, supplierName: (id: string) => string): string[]; // urutan: supplier, tanggal, per baris (jumlah, harga beli, ED), jatuh tempo, pembayaran
export function paymentSummary(p: ReceiptPayment): string;  // "Bayar sekarang · Tunai · Dari laci kasir" | "Bayar sekarang · Transfer" | "Bayar nanti · jatuh tempo 16 Nov 2026"
// receipts/views.ts
export function toOwnerReceipt(state: Readonly<MockState>, r: MockReceipt): OwnerReceipt;
export function toOwnerReceiptRow(state: Readonly<MockState>, r: MockReceipt): OwnerReceiptRow;
```
- `checkEdit`: himpunan `lineId` harus sama persis → `lines` `Baris nota tidak cocok — muat ulang`; aturan `validateReceipt` untuk supplier, tanggal, qty, unitCost, ED; pembayaran berbeda dari tersimpan dan bukan (`nanti` & `paid === null`) → `payment` `Cara bayar tidak bisa diubah — sudah dibayar`; selain itu `validatePayment` dengan `shiftOpen`.
- `applyEdit` per baris yang berubah (urut): `reviseCost(p.cost, stock, lama, baru)` → `noteCostChange(…, "ubah_nota")`; selisih qtyBase ≠ 0 → `stockEntries` `koreksi_masuk` bertanda + stok; lalu salin nilai baru ke baris (`subtotal` ikut). Selisih `laciPaid(sesudah) − laciPaid(sebelum)` ≠ 0 → `addCashOut(…, "koreksi")`; `false` → tambah perubahan `Koreksi laci tidak dicatat — tidak ada shift buka` (K6). `changes` kosong → tidak ada audit, `editedAt` tidak berubah; selain itu audit `ubah` + `editedByName/editedAt`.
- `applyCancel`: sudah `dibatalkan` → tidak berbuat apa-apa; per baris `reviseCost(…, null)` + `batal_masuk` −qtyBase; `addCashOut(−laciPaid(r), "koreksi")` (K6 bila tanpa shift); `status = "dibatalkan"`, `cancelledAt`; audit `batal` atas nama pemilik.
- Handler PUT staf: bukan milik sendiri → 404; `dibatalkan` → 409 `RECEIPT_CANCELLED`; 422 `ReceiptProblem`; 200 `StaffReceipt`. Handler pemilik (`requireOwnerSession`): daftar terbaru dulu, detail, cancel (200 idempoten).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// setup: nota mockup Task 4 (stok Indomie 60 → 140, HPP {380000,140}), lalu s.stock[indomie] = 120 (terjual 20)
test("ubah harga Indomie 112.000→108.000 → HPP {317714,120} (Rp2.648); stok tetap 120; butir modal sumber ubah_nota; audit changes ['Indomie Goreng: harga beli Rp112.000 → Rp108.000']", async () => {});
test("ubah jumlah Indomie 2→1 dus → HPP {213714,80} (Rp2.671); stok 80; mutasi {kind:'koreksi_masuk', qtyBase:-40}; audit 'Indomie Goreng: jumlah 2 dus → 1 dus'", async () => {});
test("ubah 2→1 dus saat stok 30 → HPP {112000,40}; stok −10", async () => {});
test("PUT identik dua kali → HPP, stok, mutasi, dan audit sama seperti setelah PUT pertama (audit 'ubah' hanya satu)", async () => {});
test("PUT tanpa perubahan apa pun → tanpa audit, editedAt null", async () => {});
test("ubah ED Indomie ke null & supplier → changes ['Supplier CV Sumber Rejeki → Toko Grosir Makmur', 'Indomie Goreng: ED 20 Apr 2027 → —']", async () => {});
test("Gula 50→48 kg (laci, shift buka) → cashOuts += {amount:-32400, kind:'koreksi'}; Σ = 1409600; total nota 1409600", async () => {});
test("Gula 50→48 kg setelah shift ditutup → tanpa cashOut; changes memuat 'Koreksi laci tidak dicatat — tidak ada shift buka'", async () => {});
test("ubah pembayaran nota 'sekarang' → 422 payment 'Cara bayar tidak bisa diubah — sudah dibayar'; nota 'nanti' belum lunas: jatuh tempo 2026-11-16→2026-11-30 → 200, audit 'Jatuh tempo 16 Nov 2026 → 30 Nov 2026'", async () => {});
test("lineId kurang/lebih → 422 lines 'Baris nota tidak cocok — muat ulang'", async () => {});
test("Budi ubah nota Rina → 404; nota dibatalkan → 409 RECEIPT_CANCELLED", async () => {});
test("pemilik batalkan (stok 120) → HPP {101714,40} (Rp2.543); stok Indomie 40; mutasi batal_masuk −80; cashOuts += −1442000; status dibatalkan; audit [buat, batal 'Pak Ahmad']", async () => {});
test("batal kedua → 200, tanpa mutasi/audit/cashOut tambahan", async () => {});
test("batal saat stok 70 → HPP tetap {380000,140}; stok −10", async () => {});
test("daftar pemilik terbaru dulu; detail memuat audit [buat, ubah, batal] terlama dulu dan paid null", async () => {});
test("sesi staf tidak berlaku di /api/owner/receipts (401); sesi pemilik tidak berlaku di PUT /api/staff/receipts (401)", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): ubah dan batalkan nota barang masuk dengan koreksi HPP, stok, laci, dan jejak audit`.

---

### Task 6: Server palsu — utang supplier, tutup shift, "Perlu perhatian", dan barang menunggu harga (+ baris kasir)

**Risk class:** risky (uang, kontrak shift, aturan server)

**Files:** Create `web/src/mocks/receipts/debts.ts` (+ test), `handlers/owner-debts.ts` (+ test); Modify `handlers/shift.ts`, `owner-summary.ts` (+ test), `history.ts`, `handlers/catalog.ts` (+ test), `handlers/owner-products.ts` (+ test), `products/apply.ts`, `products/import.ts` (+ test), `products/views.ts` (`hasReceipts`), `handlers/index.ts`; kasir UI: `web/src/features/kasir/shift/shift-closure-dialog.tsx`, `close-shift-dialog.test.tsx`.

**Interfaces — Consumes:** Task 2 `debtStage`, Task 4 `addCashOut`, `supplierPaymentsOf`, `receiptTotalOf` (tidak memakai kode Task 5). **Produces:**
```ts
// receipts/debts.ts
export function debtsOf(state: Readonly<MockState>): MockReceipt[];           // nanti & aktif
export function paidSummary(p: Pick<DebtPayment, "method" | "cashSource">): string; // "Tunai · Dari laci kasir" | "Tunai · Uang pemilik" | "Transfer"
export function toSupplierDebt(state: Readonly<MockState>, r: MockReceipt): SupplierDebt;
export function debtAttention(state: Readonly<MockState>, now: number): SupplierDebtAttention; // belum lunas saja, debtStage terhadap jakartaIsoDate(now)
// products/views.ts
export function hasReceipts(state: Readonly<MockState>, productId: string): boolean; // ada baris di nota aktif
```
- `GET supplier-debts`: urutan kontrak; `drawerShift` dari `state.shift`. `POST …/pay`: nota tidak ada/bukan `nanti` → 404; `dibatalkan` → 409 `RECEIPT_CANCELLED`; sudah lunas → 409 `DEBT_ALREADY_PAID`; `tunai` tanpa `cashSource` atau `transfer` dengan `cashSource` → 422 `VALIDATION`; `tunai + laci` tanpa shift → 409 `SHIFT_CLOSED`; sukses: `paid = {at, method, cashSource, byName}`, `addCashOut(total, "lunas")` bila laci, audit `lunas` changes `[paidSummary(input)]`. `amount` utang selalu diturunkan dari `receiptTotalOf` (tidak disalin), sehingga ubah nominal (Task 5) otomatis ikut.
- Tutup shift: `supplierPayments = supplierPaymentsOf(shift)`, `expectedCash = openingCash + cashSales − supplierPayments`; `MockClosedShift` ikut. Buka shift: `cashOuts: []`. `history.ts`: shift riwayat `supplierPayments: 0`.
- `ownerTodaySummary.attention`: `supplierDebts = debtAttention(state, now)`, `awaitingPriceCount` = jumlah barang `menunggu_harga`; `stockAlertOf`: `menunggu_harga` diperlakukan seperti `aktif`.
- Katalog kasir: `menunggu_harga` → lookup 410 `PRODUCT_NO_PRICE` "Barang belum punya harga jual"; search & quick-curah membuangnya.
- Barang pemilik: `PUT …/status` pada barang `menunggu_harga` atau dengan `status: "menunggu_harga"` → 422 `VALIDATION` "Isi harga jual dulu". `applyDraft` (mode `replace`): target `menunggu_harga` & draf lolos validasi → `status: "aktif"`, `priceEntries` dengan `oldPrice: null`; target `hasReceipts` → `cost = target.cost` (K16), `costChanged: false`, tanpa perubahan `Harga modal …`; impor (`merge`) untuk barang `hasReceipts` dengan modal terisi → notes + `Modal diabaikan — mengikuti barang masuk`. `toOwnerProduct.hasReceipts` = `hasReceipts(state, p.id)`.
- Kasir UI: `ShiftClosureDialog` menampilkan `ResultRow` `Bayar supplier` (nilai `formatRupiah(−supplierPayments)`, `+` di depan bila positif) di atas `Uang seharusnya`, hanya bila `supplierPayments ≠ 0`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// now = 2 Nov 2026 10.00 WIB (vi.setSystemTime). Nota "nanti" via API: Toko Grosir Makmur 2026-10-20 Rp1.275.000 jatuh tempo 2026-10-30;
// Toko Grosir Makmur 2026-10-28 Rp1.370.000 jatuh tempo 2026-11-11; CV Sumber Rejeki 2026-11-02 Rp1.442.000 jatuh tempo 2026-11-16
test("supplier-debts: 3 utang belum lunas urut jatuh tempo; jumlah 4087000; drawerShift null tanpa shift", async () => {});
test("attention.supplierDebts = {overdueCount:1, overdueTotal:1275000, dueSoonCount:0, dueSoonTotal:0}", async () => {});
test.each([["2026-11-05", 1], ["2026-11-02", 1], ["2026-11-06", 0]])("utang jatuh tempo %s → dueSoonCount %i", async () => {});
test("lunas transfer → paid {method:'transfer', cashSource:null, byName:'Pak Ahmad'}; keluar dari hitungan perhatian; bayar lagi → 409 DEBT_ALREADY_PAID", async () => {});
test("lunas tunai laci tanpa shift → 409 SHIFT_CLOSED; dengan shift Rina → cashOuts [{amount:1275000, kind:'lunas'}], drawerShift {kasirName:'Rina'}", async () => {});
test("tunai tanpa cashSource → 422; nota dibatalkan (status diubah di state) → 409 RECEIPT_CANCELLED", async () => {});
test("amount utang diturunkan: qty baris Gula di state diubah 50 → 48 → amount 1409600; audit lunas changes ['Transfer']", async () => {});
test("tutup shift: modal 1.500.000 + tunai 150.000 − Bayar supplier 1.442.000, uang fisik 203.000 → {supplierPayments:1442000, expectedCash:208000, difference:-5000}", async () => {});
test("tutup shift tanpa uang keluar → supplierPayments 0, expectedCash = modal + tunai (perilaku lama)", async () => {});
test("barang baru dari nota → awaitingPriceCount 1; kasir lookup 8996001600269 → 410 PRODUCT_NO_PRICE; search 'teh botol' → []", async () => {});
test("PUT status barang menunggu → 422 'Isi harga jual dulu'", async () => {});
test("PUT barang menunggu dengan price 4000 & bigUnit.price 90000 → status aktif, awaitingPriceCount 0, priceHistory oldPrice null (tanpa 'Rp0')", async () => {});
test("Indomie setelah barang masuk: hasReceipts true; PUT dengan bigUnit.cost 120000 → cost tetap {380000,140}, tanpa butir modal baru; impor modal Indomie → notes memuat 'Modal diabaikan — mengikuti barang masuk'", async () => {});
// close-shift-dialog.test.tsx (UI kasir)
test("hasil tutup shift: 'Bayar supplier' '-Rp1.442.000' di atas 'Uang seharusnya' 'Rp208.000'; Selisih '-Rp5.000'", async () => {});
test("tanpa uang keluar → tidak ada baris 'Bayar supplier'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi (test F2 tutup shift lama tetap hijau). **Step 4:** `npm test` hijau. **Step 5:** commit `feat(mock): utang supplier, Bayar supplier di tutup shift, perhatian baru, dan barang menunggu harga jual`.

---

### Task 7: Kerangka app orang toko, login PIN, dan sesi `staff_session`

**Risk class:** risky (auth)

**Files:** Move `web/src/features/kasir/shift/pin-pad.tsx` → `web/src/shared/components/pin-pad.tsx` (impor kasir diperbarui; test kasir tetap); Create `web/src/features/staff/index.ts`, `staff-layout.tsx`, `staff-nav.tsx`, `staff-page-header.tsx`, `auth/staff-session.ts`, `auth/staff-gate.tsx`, `auth/staff-login-screen.tsx`, `home/beranda-page.tsx`, `pages.tsx` (`StaffPlaceholderPage`, `StaffLainnyaPage`); Modify `web/src/app/router.tsx`, `web/src/app/styles.css` (`:root[data-app="owner"], :root[data-app="staff"]`), `web/scripts/check-bundle-size.mjs` (`{ label: "staff", prefix: "staff-", max: 50 * KB }`; K15); Tests `features/staff/staff-layout.test.tsx`, `auth/staff-gate.test.tsx`, `app/router.test.tsx`.

**Interfaces — Consumes:** gen `listStaffUsers`, `useStaffLogin`, `getStaffSession`, `getGetStaffSessionQueryKey`, `useStaffLogout`, `useGetStaffShift`; `useServerHealth`, `useBusinessDay`. **Produces:**
```ts
// shared/components/pin-pad.tsx (tanpa perubahan perilaku)
export function PinPad(props: { onComplete: (pin: string) => void; pending: boolean; error: string | null }): JSX.Element;
// features/staff/auth/staff-session.ts — cermin owner-session, realm = URL berawalan "/api/staff/"
export function useStaffSession(): UseQueryResult<Session | null, ApiError>;
export function setStaffSession(client: QueryClient, session: Session): void;
export function clearStaffSession(client: QueryClient): void;      // buang query /api/staff/* kecuali sesi
export function useStaffLogoutOnUnauthorized(): void;              // 401 dari /api/staff/* → login; 401 realm lain diabaikan
// features/staff/staff-page-header.tsx
export function StaffPageHeader(props: { title: string; eyebrow?: ReactNode; action?: ReactNode }): JSX.Element;
// features/staff/index.ts
export { StaffLayout, StaffBerandaPage, StaffPlaceholderPage, StaffLainnyaPage };
```
Rute (anak `staffRoute` `path: "staff"`, semua dari `loadStaff = () => import("@/features/staff")`): `/` → `StaffBerandaPage`; `masuk`, `masuk/baru` (`validateSearch` `{ draf?: string; langkah?: "bayar" }`), `masuk/$receiptId` → `StaffPlaceholderPage` sampai Task 10/11; `opname`, `kedaluwarsa` → `StaffPlaceholderPage`; `lainnya` → `StaffLainnyaPage`. `StaffLayout` menyetel `document.documentElement.dataset.app = "staff"` (hapus saat unmount), membungkus `StaffGate` → kerangka: header per tab (judul dari tabel teks; hanya di akar tab), `StaffNav` (salinan kelas `OwnerNav`, 5 tab; dua pemakai belum memenuhi aturan tiga), `<main>` dengan ruang bawah. Login: pilih nama (default pertama), `PinPad`, `useStaffLogin` → `setStaffSession`; galat `pesanError`. Beranda: kartu `Barang masuk` → `/staff/masuk/baru`. Lainnya: `Masuk sebagai {nama}`, `Keluar` → `useStaffLogout` → `clearStaffSession` (draf HP tidak disentuh).

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("/staff tanpa sesi → 'ShaziaMart · Stok', 'Masuk dengan akun kasir', tombol Rina & Budi (tanpa Pak Ahmad), 'Hanya bisa dipakai di Wi-Fi toko'", async () => {});
test("pilih Budi → 'Masukkan PIN Budi'; PIN 654321 → judul 'Stok', 'Budi · Wi-Fi toko', nav 'Navigasi orang toko' berisi 5 tab", async () => {});
test("PIN salah → 'PIN salah'; login 403 STAFF_LAN_ONLY (server.use) → 'Hanya bisa dipakai di Wi-Fi toko'", async () => {});
test("login staf tidak membuat sesi kasir: /kasir tetap meminta Buka shift; /owner tetap menampilkan login pemilik", async () => {});
test("401 dari query /api/staff/* → kembali ke login; 401 dari /api/owner/* tidak mengeluarkan staf", async () => {});
test("tab Opname & Kedaluwarsa → 'Segera hadir'; Lainnya → 'Masuk sebagai Rina' → Keluar → layar login", async () => {});
test("html[data-app='staff'] saat di /staff, hilang setelah pindah ke /kasir", async () => {});
test("offline (health gagal) → 'Rina · Tidak tersambung ke toko'", async () => {});
test("router: /staff memuat chunk terpisah (lazyRouteComponent loadStaff); /staff/tidak-ada → Halaman tidak ditemukan", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup layar 1–2 (bagian kedaluwarsa/menipis/opname di Beranda belum digambar di F3b-2a). **Step 4:** `npm test && npm run build && npm run size:check` → ada `staff-*.js` ≤ 50 KB; `grep -c "/api/owner" dist/assets/staff-*.js` = 0; K15 bila perlu. **Step 5:** commit `feat(staff): kerangka app orang toko dengan login PIN akun kasir`.

---

### Task 8: Draf offline di HP dan kirim ulang idempoten

**Risk class:** risky (offline sync)

**Files:** Create `web/src/features/staff/drafts/draft-types.ts`, `drafts/draft-store.ts` (+ test, memori), `drafts/to-input.ts` (+ test), `drafts/sync.ts` (+ test), `drafts/use-drafts.ts` (+ test).

**Interfaces — Consumes:** Task 1 tipe & `createStaffReceipt`, `putStaffReceiptPhoto`, `customFetch`; Task 2 `validateReceipt`; Task 4 handler. **Produces:**
```ts
// draft-types.ts
export type DraftLine = { lineId: string;
  product: { id: string; name: string; category: string | null; baseUnit: ProductBaseUnit; units: StaffUnit[] } | null; // salinan untuk tampil offline
  unitId: string | null;
  newProduct: { name: string; sellUnit: string; notaUnit: string; notaUnitSize: string; barcode: string } | null;
  qty: number; unitCostText: string; expiryDate: string | null };
export type DraftPayment = { timing: "sekarang" | "nanti"; method: "tunai" | "transfer"; cashSource: "laci" | "pemilik"; dueDate: string | null };
export type ReceiptForm = { supplierName: string; notaDate: string; lines: DraftLine[]; payment: DraftPayment };
export type DraftPhoto = { id: string; blob: Blob; takenAt: number; bytes: number; uploaded: boolean };
export type DraftStatus = "editing" | "queued" | "rejected";
export type ReceiptDraft = { id: string; userId: string; createdAt: number; updatedAt: number; status: DraftStatus;
  form: ReceiptForm; photo: DraftPhoto | null; errors: ReceiptError[] };
// draft-store.ts — IndexedDB "kasir-staff" v1, object store "receipt-drafts" (keyPath "id")
export type DraftStore = { list(): Promise<ReceiptDraft[]>; get(id: string): Promise<ReceiptDraft | undefined>;
  put(d: ReceiptDraft): Promise<void>; remove(id: string): Promise<void> };
export function indexedDbDraftStore(): DraftStore;
export function memoryDraftStore(): DraftStore;          // test
export function emptyForm(today: string): ReceiptForm;   // payment default sekarang/tunai/laci, dueDate null
// to-input.ts
export function toReceiptInput(d: ReceiptDraft, ctx: { shiftOpen: boolean }): ReceiptInput; // tanpa shift: cashSource "pemilik"; transfer: null; nanti: method/cashSource null
export function formProblems(d: ReceiptDraft, ctx: { today: string; shiftOpen: boolean }): ReceiptError[]; // galat parse unitCostText ("Harga beli: ketik angka saja, mis. 3500") + validateReceipt
// sync.ts
export type SyncApi = { putPhoto(photoId: string, blob: Blob): Promise<void>; createReceipt(input: ReceiptInput): Promise<StaffReceipt> };
export type SyncReport = { sent: string[]; rejected: string[]; stopped: "offline" | "unauthorized" | "lan" | null };
export function syncDrafts(store: DraftStore, userId: string, api: SyncApi, ctx: { shiftOpen: boolean }): Promise<SyncReport>; // single-flight
export const realSyncApi: SyncApi;   // putPhoto lewat customFetch dengan Content-Type image/jpeg bila hasil orval tidak menyetelnya
// use-drafts.ts
export function useDraftStore(): DraftStore;                       // satu instance IndexedDB per app (context)
export function useDrafts(userId: string): { drafts: ReceiptDraft[]; refresh: () => void };
export function useDraftSync(userId: string | null): { syncNow: () => Promise<SyncReport>; syncing: boolean };
```
`syncDrafts`: ambil draf `userId` sama & `status === "queued"`, urut `createdAt`; per draf: foto ada & `!uploaded` → `putPhoto`, tandai `uploaded` dan simpan; `createReceipt(toReceiptInput)` → sukses (200/201): `remove`; `ApiError` `NETWORK` atau status ≥ 500 → berhenti `offline`; `UNAUTHORIZED` → `unauthorized`; `STAFF_LAN_ONLY` → `lan`; 422 `receiptProblemSchema` (juga 422 foto) → `status: "rejected"`, `errors`, lanjut draf berikut. Panggilan bersamaan berbagi satu promise. `useDraftSync`: jalan saat mount (login), saat event `online`, saat `useServerHealth().online` berubah ke true, dan tiap 30 detik selama ada draf antre; setelah ada yang terkirim → invalidasi `getListStaffReceiptsQueryKey()`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("memoryDraftStore: put/get/list (urut createdAt)/remove", async () => {});
test("toReceiptInput: draf nota mockup → ReceiptInput persis (unitCost 112000 dari '112.000'; tanpa shift → cashSource 'pemilik'; nanti → method null)", () => {});
test("formProblems: unitCostText '11.2a' → {lineId:'l1', field:'unitCost', message:'Harga beli: ketik angka saja, mis. 3500'}", () => {});
test("sync: draf antre + foto → PUT foto lalu POST nota; draf dihapus; report {sent:[id], rejected:[], stopped:null}", async () => {});
test("PUT foto gagal NETWORK → stopped 'offline', POST tidak dipanggil, draf tetap queued", async () => {});
test("respons hilang: handler POST menyimpan lalu HttpResponse.error() → offline; sync berikutnya 200 replay → draf hilang; stok Indomie +80 sekali", async () => {});
test("422 (Bimoli nonaktif) → status 'rejected' dengan errors; draf berikutnya tetap terkirim; draf ditolak tidak dikirim lagi", async () => {});
test("401 → stopped 'unauthorized'; 403 STAFF_LAN_ONLY → stopped 'lan'; draf tetap", async () => {});
test("draf Rina tidak dikirim saat Budi login; draf 'editing' tidak pernah dikirim", async () => {});
test("foto uploaded true → tanpa PUT kedua", async () => {});
test("dua syncDrafts bersamaan → satu POST", async () => {});
test("useDraftSync: event 'online' memicu sync; tiap 30 dtk selama ada draf antre (fake timers)", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi (IndexedDB dibungkus Promise sendiri, tanpa library; dites lewat E2E Task 14). **Step 4:** `npm test` hijau. **Step 5:** commit `feat(staff): draf barang masuk di HP dan kirim ulang aman dengan ID draf`.

---

### Task 9: Lembar baris barang masuk (cari, scan, satuan, barang baru)

**Risk class:** UI

**Files:** Move `web/src/features/owner/products/scan/{barcode-scanner.tsx, scan-button.tsx, use-barcode-support.ts, barcode-detector.d.ts}` + test `barcode-scanner.test.tsx`, `use-barcode-support.test.ts` → `web/src/shared/components/scan/` (impor owner diperbarui; `scan-integration.test.tsx` tetap di owner); Create `web/src/features/staff/receipt/line-model.ts` (+ test), `receipt/line-sheet.tsx` (+ test `line-sheet.test.tsx`), `receipt/product-picker.tsx`, `receipt/new-product-fields.tsx`, `receipt/qty-stepper.tsx`.

**Interfaces — Consumes:** `useSearchStaffProducts`; Task 2 `newProductUnits`, `receiptLineTotal`; Task 8 `DraftLine`; `parseRupiah`, `formatQty`, `formatRupiah`, `isValidBarcode`. **Produces:**
```ts
// shared/components/scan/scan-button.tsx — tambah prop label (pemilik: "Scan dengan kamera")
export function ScanButton(props: { label: string; purpose: ScanPurpose; onDetected: (code: string) => void; onManual: () => void }): JSX.Element | null;
// line-model.ts
export type UnitOption = { unitId: string; label: string; unitSize: number; perEceran: number };
export function unitOptions(units: readonly StaffUnit[]): UnitOption[];  // units[0] label = nama; lainnya "{nama} (isi {unitSize ÷ units[0].unitSize})"
export function equivalence(qty: number, option: UnitOption, eceran: StaffUnit): string | null; // perEceran > 1 → "= {formatQty(qty × unitSize, eceran.unitSize, eceran.name)}"
export function lineSummary(line: DraftLine): { title: string; detail: string; subtotal: number | null }; // "2 dus × Rp112.000 · ED 20 Apr 2027"
export function lineProblems(line: DraftLine): ReceiptError[];   // formProblems untuk satu baris (dipakai tombol simpan baris)
// line-sheet.tsx
export function LineSheet(props: { open: boolean; line: DraftLine | null; locked: boolean; otherLines: readonly DraftLine[];
  onSave: (line: DraftLine) => void; onRemove: (() => void) | null; onClose: () => void }): JSX.Element;
```
- Sheet Radix dari bawah (laptop di tengah ≤ 480px), teks tabel `lembar baris`. Cari: debounce 250 ms, ≥ 2 huruf atau angka; `ScanButton purpose="cari" label="Scan barcode dengan kamera"` → `q = code`; hasil tepat satu dari scan → langsung terpilih. Tanpa hasil → `Barang baru: {q}` membuka `NewProductFields` (nama terisi `q`; `Dijual per` & `Satuan di nota` `<input list>` datalist satuan F3b-1; `Satuan di nota` default = `Dijual per`; `Isi` hanya bila berbeda; `Barcode` + ScanButton `purpose="eceran"`).
- Barang terpilih: kartu nama/kategori + `Ganti barang` (tidak ada bila `locked`); `Satuan di nota` segmented `role="radiogroup"` (default satuan terakhir = satuan besar bila ada); `Jumlah` stepper + isian angka (`inputMode="numeric"`, min 1); `Harga beli / {satuan}` `inputMode="numeric"`; `Kedaluwarsa` `<input type="date">`; `Subtotal` = `receiptLineTotal` atau `—`. Simpan → `lineProblems` (dan nama/barcode barang baru dibanding `otherLines`) → pesan di bawah isian, fokus ke isian salah pertama; lolos → `onSave`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("unitOptions Indomie → [{label:'pcs', perEceran:1}, {label:'dus (isi 40)', perEceran:40}]; Gula → [{label:'kg', unitSize:1000, perEceran:1}]", () => {});
test("equivalence: 2 × dus Indomie → '= 80 pcs'; pcs → null; karung isi 25 kg ×2 → '= 50 kg'", () => {});
test("lineSummary: '2 dus × Rp112.000 · ED 20 Apr 2027' subtotal 224000; tanpa ED tanpa ' · ED'", () => {});
test("cari 'indomie' → pilih → 'Mi Instan'; Satuan di nota 'dus (isi 40)'; + → 2 → '= 80 pcs'; 'Harga beli / dus' 112.000 → 'Subtotal' 'Rp224.000'; ED 2027-04-20 → Tambahkan ke nota → onSave {unitId: dus, qty:2, unitCostText:'112.000', expiryDate:'2027-04-20'}", async () => {});
test("scan kamera palsu '089686010947' → Indomie langsung terpilih", async () => {});
test("'teh botol' tanpa hasil → 'Tidak ada barang yang cocok' → 'Barang baru: teh botol' → Dijual per 'botol', Satuan di nota 'dus', Isi 24, harga 96.000, Jumlah 2 → 'Rp192.000', '= 48 botol'", async () => {});
test("validasi: harga kosong → 'Harga beli belum diisi'; Isi 1 untuk dus → 'Satuan besar: isi berapa? (min. 2)'; barcode '123' → 'Barcode salah, scan ulang'; tanpa onSave", async () => {});
test("locked (ubah nota): tanpa 'Ganti barang' dan tanpa 'Hapus baris'; judul 'Ubah barang'", async () => {});
test("tanpa BarcodeDetector → tidak ada tombol 'Scan barcode dengan kamera'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup layar 4. **Step 4:** `npm test` (test scan pemilik tetap hijau setelah pindah). **Step 5:** commit `feat(staff): lembar baris barang masuk dengan cari, scan kamera, dan barang baru`.

---

### Task 10: Form nota — nota, foto, pembayaran, dan simpan

**Risk class:** UI

**Files:** Create `web/src/features/staff/receipt/receipt-form-page.tsx` (+ test), `receipt/nota-step.tsx`, `receipt/payment-step.tsx`, `receipt/photo-field.tsx`, `receipt/compress-photo.ts` (+ test), `receipt/form-model.ts` (+ test), `receipt/date-row.tsx`; Modify `features/staff/index.ts`, `app/router.tsx` (`masuk/baru` → `ReceiptFormPage`).

**Interfaces — Consumes:** Task 7 kerangka & sesi; Task 8 store/`formProblems`/`toReceiptInput`/`useDraftSync`; Task 9 `LineSheet`, `lineSummary`; `useListStaffSuppliers`, `useGetStaffShift`; Task 2 `receiptTotal`, `addIsoDays`, `formatIsoDate`; `jakartaTime`. **Produces:**
```ts
// compress-photo.ts
export const PHOTO_MAX_BYTES = 300 * 1024;
export type Attempt = { longSide: number; quality: number };
export const FIRST_ATTEMPT: Attempt = { longSide: 1600, quality: 0.8 };
export function nextAttempt(a: Attempt, bytes: number): Attempt | null;
export async function compressPhoto(file: Blob): Promise<{ blob: Blob; bytes: number }>; // createImageBitmap → canvas → toBlob("image/jpeg", q)
// form-model.ts
export const DUE_CHIPS = [7, 14, 30] as const;
export function lineCount(f: ReceiptForm): number;
export function formTotal(f: ReceiptForm): number | null;          // null bila ada harga belum terbaca
export function drawerNote(shift: Shift | null, total: number): string | null; // teks catatan laci (tabel)
export function photoCaption(p: DraftPhoto): string;               // "Diambil 14.12 · 214 KB" (KB = round(bytes/1024))
export function ReceiptFormPage(): JSX.Element;                    // mode baru; mode ubah ditambah Task 11
```
`nextAttempt` (pakai persis):
```ts
if (bytes <= PHOTO_MAX_BYTES) return null;
if (a.quality > 0.45) return { longSide: a.longSide, quality: Math.round((a.quality - 0.1) * 10) / 10 };
if (a.longSide > 900) return { longSide: Math.round(a.longSide * 0.8), quality: 0.8 };
return null;   // terima apa adanya (server menolak > 1 MB)
```
- Tanpa `draf` → buat draf `{id: newId(), userId, status: "editing", form: emptyForm(jakartaIsoDate(now))}` lalu `navigate({ search: { draf: id }, replace: true })`; draf tidak ada/milik orang lain → buat baru. Setiap perubahan form → `store.put` (debounce 300 ms) dan keterangan `Draf tersimpan di HP`.
- Langkah nota (layar 3a): `Supplier` = `<input list>` + datalist dari `listStaffSuppliers`; `Tanggal nota` & tanggal lain = `DateRow` (teks `formatIsoDate` + `<input type="date">` transparan berlabel baris; `max` hari ini untuk nota); foto: `<input type="file" accept="image/*" capture="environment">` → `compressPhoto` → `DraftPhoto` baru (`id: newId()`, `uploaded: false`); baris → `LineSheet`; `Lanjut ke pembayaran` → `formProblems` khusus nota (tanpa pembayaran) → galat tampil di field/baris; lolos → `search.langkah = "bayar"`.
- Langkah bayar (3b/3c): segmented `Kapan dibayar`, `Cara bayar` (hanya `sekarang`), `Uang dari` (hanya `tunai` dan ada shift; tanpa shift → catatan tanpa shift), catatan laci `drawerNote`, `Jatuh tempo` + chip (dari `notaDate`), catatan nanti. `Simpan barang masuk`: `formProblems` → galat (kembali ke langkah nota bila galat di baris) ; lolos → draf `queued` → `syncNow()` → `sent` toast `Barang masuk tersimpan` + `/staff/masuk`; `offline`/`lan`/`unauthorized` toast `Belum terkirim — dikirim otomatis saat tersambung` + `/staff/masuk`; draf `rejected` → tetap, galat dari server ditampilkan per baris/field, toast `Perlu dibetulkan — lihat pesan di baris`. Tombol nonaktif selama sync.
- `Batal` → dialog `Buang draf ini?`; `Buang draf` → `remove` + `/staff/masuk`; `Simpan draf` → `/staff/masuk`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test.each([[{ longSide: 1600, quality: 0.8 }, 250_000, null], [{ longSide: 1600, quality: 0.8 }, 400_000, { longSide: 1600, quality: 0.7 }],
  [{ longSide: 1600, quality: 0.4 }, 400_000, { longSide: 1280, quality: 0.8 }], [{ longSide: 819, quality: 0.4 }, 400_000, null]])("nextAttempt", …);
test("photoCaption: takenAt 14.12 WIB, 219_136 byte → 'Diambil 14.12 · 214 KB'", () => {});
test("drawerNote shift Rina buka 07.00, total 1442000 → 'Dicatat sebagai uang keluar di shift Rina (buka 07.00). Di tutup shift muncul Bayar supplier −Rp1.442.000.'", () => {});
test("nota: 'Barang masuk', 'Draf tersimpan di HP'; tanggal nota default hari ini; tiga baris mockup → 'Barang' '3 baris', '2 dus × Rp112.000 · ED 20 Apr 2027' 'Rp224.000', 'Total berjalan' 'Rp1.442.000'", async () => {});
test("autosave: ketik supplier → setelah 300 ms draf di store memuat supplierName 'CV Sumber Rejeki'", async () => {});
test("foto (compressPhoto di-mock 219_136 byte) → '1 lembar', 'Diambil {HH.MM} · 214 KB'; tanpa foto → 'Belum ada foto'", async () => {});
test("Lanjut tanpa supplier & baris → 'Supplier belum diisi', 'Belum ada barang di nota'; tetap di langkah nota", async () => {});
test("bayar dengan shift: '3 barang' 'Rp1.442.000'; default Bayar sekarang/Tunai/Dari laci kasir + catatan laci; Transfer → baris 'Uang dari' hilang", async () => {});
test("bayar tanpa shift: tidak ada 'Dari laci kasir'; catatan 'Tidak ada shift kasir yang buka — uang dicatat sebagai uang pemilik.'; body cashSource 'pemilik'", async () => {});
test("Bayar nanti: chip '14 hari' → 'Jatuh tempo' '16 Nov 2026' (nota 2 Nov 2026); catatan Utang supplier; body {timing:'nanti', method:null, cashSource:null, dueDate:'2026-11-16'}", async () => {});
test("Simpan → PUT foto lalu POST body = toReceiptInput; toast 'Barang masuk tersimpan'; di /staff/masuk; draf hilang dari store", async () => {});
test("server mati → toast 'Belum terkirim — dikirim otomatis saat tersambung'; draf status queued", async () => {});
test("422 Bimoli nonaktif → kembali ke langkah nota, 'Barang ini tidak dijual lagi' di bawah baris Bimoli; toast 'Perlu dibetulkan — lihat pesan di baris'", async () => {});
test("Simpan diklik dua kali cepat → satu POST", async () => {});
test("Batal → 'Buang draf ini?' → Buang draf → draf terhapus; Simpan draf → draf tetap 'editing'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup 3a/3b/3c. **Step 4:** `npm test && npm run build && npm run size:check`. **Step 5:** commit `feat(staff): form barang masuk dengan foto nota terkompres, pembayaran, dan simpan lewat draf`.

---

### Task 11: Tab Masuk — draf, nota terkirim, dan ubah nota

**Risk class:** UI

**Files:** Create `web/src/features/staff/receipt/masuk-page.tsx` (+ test), `receipt/receipt-row.tsx`, `receipt/edit-model.ts` (+ test); Modify `receipt/receipt-form-page.tsx` (mode ubah), `home/beranda-page.tsx` (bagian `Belum terkirim ({n})`), `features/staff/index.ts`, `app/router.tsx` (`masuk`, `masuk/$receiptId`).

**Interfaces — Consumes:** Task 8 `useDrafts`, `useDraftSync`; Task 10 form; `useListStaffReceipts`, `useGetStaffReceipt`, `useUpdateStaffReceipt`, `receiptProblemSchema`; `useServerHealth`. **Produces:**
```ts
export function formFromReceipt(r: StaffReceipt, products: Map<string, StaffProduct> | null): ReceiptForm; // baris locked; unitCostText = formatAngka
export function toReceiptEdit(f: ReceiptForm): ReceiptEdit;
export function MasukPage(): JSX.Element;                        // pembayaran bisa diubah ⇔ StaffReceipt.paymentEditable
```
- `MasukPage`: judul besar `Barang masuk`, tombol `Catat barang masuk` → `/staff/masuk/baru`; bagian `Belum terkirim` (draf `queued` tanda `Belum terkirim`, `rejected` tanda `Perlu dibetulkan`), `Draf` (`editing`), `Terkirim` (`listStaffReceipts`; tanda `Dibatalkan`); total draf dari `formTotal`. Ketuk draf → `/staff/masuk/baru?draf={id}`; ketuk nota → `/staff/masuk/$receiptId`.
- Mode ubah: muat `getStaffReceipt`; `LineSheet locked`; tanpa `Tambah barang`; langkah bayar: `r.paymentEditable` → isian seperti Task 10 (tanpa draf), selain itu `Pembayaran` hanya-baca; tombol `Simpan perubahan` → `PUT` (online saja: offline → nonaktif + catatan); 422 → galat per baris; 409 `RECEIPT_CANCELLED` → pesan; sukses → toast `Perubahan tersimpan` + kembali. Nota `dibatalkan` → hanya-baca dengan tanda `Dibatalkan`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("daftar: draf antre 'Belum terkirim', draf ditolak 'Perlu dibetulkan', draf 'Draf', nota server di 'Terkirim' — 'CV Sumber Rejeki' / '2 Nov 2026 · 3 barang' / 'Rp1.442.000'", async () => {});
test("kosong → 'Belum ada barang masuk'; Beranda: 'Belum terkirim (1)' saat ada draf antre", async () => {});
test("ketuk nota → mode ubah: tanpa 'Tambah barang'; buka Gula → tanpa 'Ganti barang'/'Hapus baris'; 50 → 48 → Simpan baris → 'Total berjalan' 'Rp1.409.600'", async () => {});
test("Simpan perubahan → PUT body {supplierName, notaDate, lines:[3 baris, Gula qty 48], payment sama}; toast 'Perubahan tersimpan'", async () => {});
test("nota 'sekarang' → 'Pembayaran' 'Bayar sekarang · Tunai · Dari laci kasir' hanya-baca; nota 'nanti' → chip jatuh tempo bisa diubah", async () => {});
test("offline → 'Simpan perubahan' nonaktif + 'Perlu tersambung ke toko untuk menyimpan perubahan'", async () => {});
test("nota dibatalkan → tanda 'Dibatalkan', tanpa tombol simpan; PUT 409 → 'Nota ini sudah dibatalkan'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test`. **Step 5:** commit `feat(staff): tab Masuk dengan draf belum terkirim dan ubah nota`.

---

### Task 12: App pemilik — utang supplier, tandai lunas, menu Lainnya, dan "Perlu perhatian"

**Risk class:** UI

**Files:** Create `web/src/features/owner/more/lainnya-page.tsx` (+ test), `more/debts/debts-page.tsx` (+ test), `more/debts/debt-detail-page.tsx` (+ test), `more/debts/pay-sheet.tsx`, `more/debts/debt-model.ts` (+ test), `owner/common/receipt-photo.tsx` (baris foto + dialog layar penuh, dipakai Task 13); Modify `owner/pages.tsx` (hapus `LainnyaPage` lama), `owner/index.ts`, `owner/home/home-model.ts` (+ test), `home/attention-list.tsx`, `owner/common/sub-page-header.tsx` (fallback union), `app/router.tsx` (`lainnya/utang`, `lainnya/utang/$receiptId`).

**Interfaces — Consumes:** `useListOwnerSupplierDebts`, `usePayOwnerSupplierDebt`, `useGetOwnerTodaySummary`; Task 2 `debtStage`, `formatIsoDate`, `formatIsoDayMonth`, `isoDaysBetween`, `jakartaIsoDate`; `relativeDayTime`, `SubPageHeader`, `FitAmount`. **Produces:**
```ts
// debt-model.ts
export type DebtGroup = { supplierName: string; total: number; debts: SupplierDebt[] };
export function unpaidSummary(debts: SupplierDebt[], today: string): { total: number; notes: number; suppliers: number; overdue: number };
export function groupBySupplier(debts: SupplierDebt[]): DebtGroup[];  // belum lunas; supplier dengan jatuh tempo terdekat dulu
export function dueText(dueDate: string, today: string): string;      // "Jatuh tempo 11 Nov · 9 hari lagi" | "Jatuh tempo 2 Nov · hari ini" | "Jatuh tempo 30 Okt"
// home-model.ts — AttentionItem.icon + "debt" | "price"; AttentionLink + { to: "/owner/lainnya/utang" } | { to: "/owner/barang"; search: { menunggu: true } }
// urutan: stok minus, utang lewat, perubahan modal, barang baru menunggu harga, stok menipis, utang segera, barang habis, selisih kas, kasbon > 30 hari
// sub-page-header.tsx
back.fallback: "/owner/barang" | "/owner/lainnya" | "/owner/lainnya/utang" | "/owner/lainnya/barang-masuk";
```
- `LainnyaPage`: kartu daftar ala Settings — `Barang masuk` → `/owner/lainnya/barang-masuk` (rute Task 13; sampai ada, `Segera hadir`), `Utang supplier` + total belum dibayar → `/owner/lainnya/utang`; lalu `Keluar` (perilaku lama).
- `DebtsPage` (9a): `SubPageHeader` back `Lainnya`, eyebrow `businessDayLabel`, judul `Utang supplier`; kartu ringkasan (`FitAmount` hero); grup per supplier; baris tautan ke detail; tanda `Lewat jatuh tempo` (danger) / `Segera jatuh tempo` (warning); bagian `Sudah lunas`.
- `DebtDetailPage` (9b): data dari daftar (tanpa endpoint detail); `ReceiptPhotoRow` (thumbnail `<img src="/api/owner/receipt-photos/{id}">`, ketuk → dialog `Foto nota`); `Tandai lunas` → `PaySheet`: `Uang dari` hanya bila `Tunai` dan `drawerShift !== null` (selain itu `cashSource: "pemilik"`); sukses → invalidasi daftar & ringkasan → kembali ke daftar; galat `pesanError`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// now 2 Nov 2026 10.00 WIB; data tiga utang mockup (Task 6)
test.each([["2026-11-11", "Jatuh tempo 11 Nov · 9 hari lagi"], ["2026-11-02", "Jatuh tempo 2 Nov · hari ini"], ["2026-10-30", "Jatuh tempo 30 Okt"]])("dueText", …);
test("unpaidSummary → {total:4087000, notes:3, suppliers:2, overdue:1}; groupBySupplier → [Toko Grosir Makmur 2645000, CV Sumber Rejeki 1442000]", () => {});
test("halaman: 'Utang supplier', 'Belum dibayar' 'Rp4.087.000', '3 nota · 2 supplier', '1 lewat jatuh tempo'; 'Nota 20 Okt 2026' 'Rp1.275.000' 'Jatuh tempo 30 Okt' + 'Lewat jatuh tempo'; 'Jatuh tempo 16 Nov · 14 hari lagi'", async () => {});
test("utang jatuh tempo 5 Nov → 'Jatuh tempo 5 Nov · 3 hari lagi' + 'Segera jatuh tempo'", async () => {});
test("detail: kembali 'Utang', 'Toko Grosir Makmur · nota 20 Okt 2026', 'Rp1.275.000', 'Dicatat Rina · {relativeDayTime}', 'Jatuh tempo' '30 Okt 2026'", async () => {});
test("Tandai lunas (shift Rina buka): 'Nominal' 'Rp1.275.000'; Tunai + Dari laci kasir → POST {method:'tunai', cashSource:'laci'} → kembali; nota pindah ke 'Sudah lunas'", async () => {});
test("tanpa shift → tidak ada 'Dari laci kasir'; Transfer → baris 'Uang dari' hilang; POST {method:'transfer', cashSource:null}", async () => {});
test("409 DEBT_ALREADY_PAID → 'Utang ini sudah lunas' di lembar", async () => {});
test.each([
  [{ supplierDebts: { overdueCount: 1, overdueTotal: 1275000, dueSoonCount: 0, dueSoonTotal: 0 } },
   { title: "Utang supplier lewat jatuh tempo", detail: "1 nota · Rp1.275.000", tone: "critical", icon: "debt", link: { to: "/owner/lainnya/utang" } }],
  [{ supplierDebts: { overdueCount: 0, overdueTotal: 0, dueSoonCount: 2, dueSoonTotal: 2812000 } },
   { title: "Utang supplier segera jatuh tempo", detail: "2 nota · Rp2.812.000", tone: "warning" }],
  [{ awaitingPriceCount: 3 }, { title: "3 barang baru dari barang masuk", detail: "Lengkapi harga jual", tone: "warning", icon: "price",
    link: { to: "/owner/barang", search: { menunggu: true } } }],
])("attentionItems %o", …);   // + urutan sesuai Interfaces
test("Lainnya: 'Barang masuk', 'Utang supplier' 'Rp4.087.000', tombol 'Keluar' tetap bekerja", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi sesuai mockup 9a/9b. **Step 4:** `npm test`. **Step 5:** commit `feat(owner): utang supplier dengan tandai lunas dan butir perhatian jatuh tempo`.

---

### Task 13: App pemilik — barang masuk, batalkan nota, barang menunggu harga, dan modal hanya-baca

**Risk class:** UI

**Files:** Create `web/src/features/owner/more/receipts/receipts-page.tsx` (+ test), `more/receipts/receipt-detail-page.tsx` (+ test), `more/receipts/receipt-model.ts` (+ test); Modify `owner/index.ts`, `app/router.tsx` (`lainnya/barang-masuk`, `lainnya/barang-masuk/$receiptId`; `barang` `validateSearch` + `menunggu?: true`), `products/product-model.ts` (+ test: `ProductFilter.menunggu`, chip, badge `menunggu_harga`), `products/barang-page.tsx`, `products/product-row.tsx`, `products/detail/product-detail-page.tsx`, `detail/price-card.tsx`, `detail/status-card.tsx`, `detail/movements-sheet.tsx` (+ ringkasan stok), `products/form/form-state.ts` (+ test), `form/product-form-page.tsx`, `products/price/cost-sheet.tsx`; Tests `barang-page.test.tsx`, `product-detail-page.test.tsx`, `product-form-page.test.tsx`, `cost-sheet.test.tsx`.

**Interfaces — Consumes:** `useListOwnerReceipts`, `useGetOwnerReceipt`, `useCancelOwnerReceipt`; Task 12 `ReceiptPhotoRow`; Task 5 teks audit (dari server). **Produces:**
```ts
// receipt-model.ts
export function receiptRowDetail(r: OwnerReceiptRow): string;     // "2 Nov 2026 · 3 barang · Rina"
export function receiptBadge(r: OwnerReceiptRow): { label: "Belum lunas" | "Dibatalkan"; tone: "warning" | "neutral" } | null;
export function auditTitle(e: ReceiptAuditEntry): string;          // "Dicatat oleh Rina" | "Diubah oleh Rina" | "Dibatalkan oleh Pak Ahmad" | "Ditandai lunas oleh Pak Ahmad"
// product-model.ts
export type ProductFilter = { q: string; kategori: string | null; nonaktif: boolean; menunggu: boolean }; // menunggu=true → hanya menunggu_harga
Badge.key + "menunggu_harga" (label "Menunggu harga jual", tone "warning", ikon CircleDollarSign; urutan pertama)
export function menungguCount(rows: OwnerProductRow[]): number;
// form-state.ts
export function formValuesFromProduct(p: OwnerProduct): FormValues;  // menunggu_harga → price/bigPrice ""
// movements-sheet: label per kind (tabel "riwayat stok"); cost-sheet: by = {pemilik:"oleh Pemilik", impor:"lewat Impor Excel", barang_masuk:"lewat Barang masuk", ubah_nota:"lewat ubah nota"}
```
- Daftar barang: chip `Menunggu harga jual {n}` (setelah kategori, sebelum `Nonaktif`, hanya bila n > 0) menyetel `menunggu: true`; baris barang menunggu: harga `—` + tanda. Detail: tanda di atas; baris harga `—` tanpa keterangan modal/untung; kartu status tersembunyi untuk `menunggu_harga`; `Ubah` tetap ada.
- Form: barang `menunggu_harga` → `Harga jual` kosong (wajib, aturan F3b-1); `hasReceipts` → isian `Harga modal` eceran & satuan besar `disabled` dengan nilai modal sekarang dan keterangan `Mengikuti barang masuk`.
- `ReceiptsPage`: judul `Barang masuk` (SubPageHeader back `Lainnya`), baris tautan. `ReceiptDetailPage`: eyebrow, judul total, foto, bagian `Barang` (baris format nota), `Pembayaran`, `Status` (hanya `nanti`), `Riwayat` (`auditTitle` + `relativeDayTime` + `changes`), `Batalkan nota` (hanya `aktif`) → dialog konfirmasi → `cancelOwnerReceipt` → invalidasi daftar nota, utang, barang, ringkasan.

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("receiptRowDetail & receiptBadge: nanti belum lunas → 'Belum lunas'; dibatalkan → 'Dibatalkan'; sekarang → null", () => {});
test("daftar barang masuk: 'CV Sumber Rejeki' / '2 Nov 2026 · 3 barang · Rina' / 'Rp1.442.000'", async () => {});
test("detail: 'CV Sumber Rejeki · nota 2 Nov 2026', 'Rp1.442.000', baris '2 dus × Rp112.000 · ED 20 Apr 2027', 'Pembayaran' 'Bayar sekarang · Tunai · Dari laci kasir', Riwayat 'Dicatat oleh Rina'", async () => {});
test("setelah ubah: Riwayat 'Diubah oleh Rina' + 'Gula Pasir: jumlah 50 kg → 48 kg'", async () => {});
test("Batalkan nota → 'Batalkan nota ini?' → Batalkan nota → tanda 'Dibatalkan', tombol hilang; stok Indomie di mockDb turun 80", async () => {});
test("foto: ketuk 'Foto nota' → dialog dengan img alt 'Foto nota' src /api/owner/receipt-photos/{id}", async () => {});
test("barang: chip 'Menunggu harga jual 1' → hanya Teh Botol Sosro 450 ml dengan tanda 'Menunggu harga jual' dan harga '—'", async () => {});
test("detail barang menunggu: baris harga '—', tanpa 'Status barang'; Ubah → Harga jual kosong; isi 4.000 & dus 90.000 → Simpan → tanda hilang", async () => {});
test("Indomie setelah barang masuk: form 'Harga modal' nonaktif bernilai 2.714 dengan 'Mengikuti barang masuk'", async () => {});
test("riwayat stok: 'Barang masuk 80 pcs' / 'Hari ini {HH.MM} · Rina' / '+80'; 'Barang masuk dibatalkan 80 pcs' '−80'", async () => {});
test("lembar harga sumber barang_masuk → '+Rp114 · lewat Barang masuk, {HH.MM}'; ubah_nota → '… · lewat ubah nota, {HH.MM}'", async () => {});
```
- [ ] **Step 2:** RED. **Step 3:** implementasi. **Step 4:** `npm test` (test F3b-1 tetap hijau). **Step 5:** commit `feat(owner): daftar barang masuk dengan batalkan nota dan barang menunggu harga jual`.

---

### Task 14: E2E barang masuk

**Risk class:** UI

**Files:** Create `web/e2e/staff-barang-masuk.spec.ts`, `web/e2e/staff-helpers.ts` (`loginStaff(page, name, pin)`, `goOffline(page)`/`goOnline(page)` lewat `context.setOffline`, `fakePhotoFile()` JPEG 2 MB 3000×4000 dari canvas); Modify `web/e2e/kasir-flows.spec.ts` (tutup shift dengan Bayar supplier), `web/e2e/owner-flows.spec.ts` (utang).

- [ ] **Step 1: Tulis test** (layar staf & pemilik di project `owner-hp`; kasir di project `kasir`; `test.skip` di project lain):
  - Kasir Rina buka shift 1.500.000 dan menjual tunai 150.000 → di HP (`/staff`, kamera palsu `stubBarcodeCamera`) Rina login, catat nota mockup (scan `089686010947` untuk Indomie, cari Bimoli & Gula, foto `fakePhotoFile` → keterangan `… KB` ≤ 300), Bayar sekarang/Tunai/Dari laci kasir → `Barang masuk tersimpan` → di kasir tutup shift dengan uang fisik 203.000 → `Bayar supplier` `-Rp1.442.000`, `Uang seharusnya` `Rp208.000`, `Selisih` `-Rp5.000`.
  - Offline: `context.setOffline(true)` → simpan nota → `Belum terkirim`; **reload halaman** → draf masih `Belum terkirim` (IndexedDB); `setOffline(false)` → terkirim otomatis dalam 35 dtk, daftar `Terkirim`; stok Indomie di detail pemilik bertambah sekali.
  - Barang baru `Teh Botol Sosro 450 ml` dari nota → Beranda pemilik `1 barang baru dari barang masuk` → ketuk → daftar tersaring → Ubah → isi harga → kasir scan `8996001600269` (sebelumnya toast `Barang belum punya harga jual`) kini masuk keranjang.
  - Beranda pemilik `Harga modal Indomie Goreng naik Rp114` → lembar menampilkan `lewat Barang masuk`.
  - Bayar nanti 14 hari → pemilik Lainnya → `Utang supplier` → detail → Tandai lunas (Uang pemilik) → pindah ke `Sudah lunas`.
  - Staf ubah Gula 50 → 48 kg → pemilik detail nota `Diubah oleh Rina`; pemilik Batalkan nota → `Dibatalkan`.
  - Request ke `/api/staff/*` dengan header `Cf-Connecting-Ip` (lewat `page.route` menambah header) → layar login menampilkan `Hanya bisa dipakai di Wi-Fi toko`.
  - Selama sesi staf, tidak ada request ke `/api/owner/` maupun `/api/catalog`, `/api/shifts` (dicatat `page.on("request")`); tidak ada respons staf yang memuat key terlarang (Global Constraints).
  - 360px: tanpa gulir horizontal di Beranda staf, nota, lembar baris, bayar, Masuk, Utang, detail utang, barang masuk; axe tanpa pelanggaran serius di layar-layar itu (360 & 1280 untuk layar pemilik); tidak ada request ke luar.
- [ ] **Step 2:** `npm run e2e` → semua lolos (E2E F1–F3b-1 tetap).
- [ ] **Step 3:** verifikasi penuh: `npm run lint && npm run typecheck && npm run knip && npm run gen:check && npm test && npm run build && npm run size:check`; lihat hasilnya di 360×800 lalu bandingkan dengan mockup layar 1–4 dan 9a/9b; screenshot sementara di scratchpad lalu hapus.
- [ ] **Step 4:** commit `test(e2e): alur barang masuk, draf offline, utang supplier, dan Bayar supplier di tutup shift`.

---

## Tinjauan mandiri terhadap spec

| Butir spec (§12e) | Task |
|---|---|
| Realm: akun kasir nama+PIN, `staff_session`, `/api/staff/…`, sesi terpisah | T1, T3, T7 |
| Header terowongan → 403, wajib dites; LAN sebenarnya di Go | T3 (semua endpoint), T14; K19 |
| Izin: tanpa ubah harga jual, tidak bisa membuka app pemilik | T3/T5 (401 lintas realm), T14 (tanpa request owner) |
| HPP tidak pernah ke staf; harga beli hanya di nota sendiri | Global Constraints, T3/T4 (`deepKeys`), T4 (Budi 404) |
| Tab Beranda · Masuk · Opname · Kedaluwarsa · Lainnya; Opname/Kedaluwarsa placeholder | T7 |
| Draf offline: IndexedDB, `Belum terkirim`, tidak hilang saat tab ditutup, idempoten per ID, foto ikut tersimpan, galat per baris, draf tetap | T8, T10, T11, T14 |
| Barang masuk: supplier (pilih/ketik), tanggal, foto, baris (cari/scan, satuan, jumlah, harga beli, ED), subtotal & total berjalan | T9, T10 |
| Pembayaran sekarang/nanti + jatuh tempo; tunai/transfer; laci/pemilik; laci tidak tersedia tanpa shift | T2, T10 |
| Setelah simpan: ledger stok, HPP, `Sedang langka` hilang, `Stok belum dihitung` (K7) | T4 |
| Foto: dikompres ±150–300 KB; disajikan lewat endpoint bersesi; tidak dihapus saat diedit | T1, T4, T10 (penyimpanan disk = Go) |
| Integrasi tutup shift: `Bayar supplier`, hitung buta tetap, koreksi di shift yang buka | T5, T6 |
| Pembaruan HPP rata-rata tertimbang, stok ≤ 0 → harga terbaru, notifikasi modal F3b-1, modal hanya-baca | T2, T4, T6, T13 |
| Edit & audit: jumlah/harga/ED/supplier/tanggal; ledger koreksi; rumus edit dengan contoh angka | T2, T5, T11, T13 |
| Batalkan nota (pemilik): balik stok, HPP, utang, laci | T5, T13 |
| Utang: daftar, mendekati 3 hari, lewat, tandai lunas tunai/transfer + laci/pemilik, tanpa sebagian, edit nominal ikut | T6, T12 |
| Barang baru dari nota: `Menunggu harga jual`, stok tercatat, tidak di kasir, scan → `Barang belum punya harga jual`, butir perhatian | T4, T6, T12, T13 |
| Tambahan "Perlu perhatian": utang segera/lewat; perubahan harga beli lewat edit (K13) | T6, T12 |
| Kedaluwarsa, opname, pengaman 1–3, log aktivitas pengiriman kasir | **di luar F3b-2a** (F3b-2b / F3c); ED sudah disimpan per baris |
| HTTPS LAN, file foto di disk, backup R2, LAN-only nyata | backend Go |

Celah yang sengaja ditunda (tinjau): ubah nota dari app pemilik (K5); bagian Beranda staf "Segera kedaluwarsa" & "Stok menipis" (F3b-2b); daftar stok menipis untuk staf (F3b-2b).

## Di luar cakupan F3b-2a (dicatat)

- Kedaluwarsa (FIFO), opname buta + persetujuan pemilik, pengaman 1–3, Beranda staf lengkap → F3b-2b. Pengaman 4–5, laporan, log aktivitas lintas fitur → F3c.
- Pelunasan sebagian, PO ke supplier, lebih dari satu foto per nota, ubah nota dari app pemilik, tambah/hapus baris saat ubah.
- Backend Go: `inventory/` (rumus Task 2 → `domain.go`), penegakan LAN gagal-tertutup, file foto di `C:\ProgramData\kasir` dengan nama acak, sertifikat LAN; kontrak tetap.
