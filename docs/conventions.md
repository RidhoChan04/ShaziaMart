# Konvensi Kode ShaziaMart

Aturan ini berlaku untuk semua kode di repo. Tujuannya satu: kode yang mudah dibaca, dipahami, dan dirawat oleh satu orang, tanpa mengorbankan kecepatan aplikasi. Bila aturan di sini bertentangan dengan spec di `docs/specs/`, spec yang menang.

## Prinsip

1. **Tulis yang dibutuhkan sekarang.** Tidak ada opsi, parameter, wrapper, atau abstraksi "untuk nanti". Abstraksi baru dibuat ketika pola yang sama dipakai di tiga tempat.
2. **Pakai yang sudah ada dulu.** Urutan: helper di repo → fitur bawaan platform/standard library → dependensi yang sudah terpasang → kode baru. Dependensi baru butuh alasan tertulis di pesan commit.
3. **Satu file, satu tanggung jawab.** File yang tumbuh melewati ±250 baris adalah sinyal untuk dipecah menurut tanggung jawab, bukan menurut jenis kode.
4. **Tidak ada kode mati.** Ekspor, file, dan dependensi yang tidak dipakai dihapus (`npm run knip` gagal bila ada).
5. **Nama menjelaskan apa, bukan bagaimana.** Komentar hanya untuk *kenapa* yang tidak terlihat dari kode, satu baris.

## Struktur `web/src`

| Folder | Isi | Aturan |
|---|---|---|
| `app/` | router, provider, query client, gaya global | tanpa logika bisnis |
| `features/kasir/`, `features/owner/` | layar per fitur, dikelompokkan per sub-fitur (`cart/`, `payment/`, …) | fitur tidak saling import; yang dipakai bersama pindah ke `shared/` |
| `shared/lib/` | logika murni (uang, berat, harga, pesan error) | tanpa React, tanpa DOM, selalu dites |
| `shared/hooks/` | hook React yang dipakai lebih dari satu fitur | |
| `shared/components/` | komponen aplikasi yang dipakai lebih dari satu fitur | |
| `shared/ui/` | komponen shadcn bergaya token kita | hanya ditambah saat benar-benar dipakai |
| `shared/api/gen/` | hasil orval | **jangan diedit**; ubah `api/openapi.yaml` lalu `npm run gen` |
| `mocks/` | backend palsu (MSW) | hanya aktif saat development / `VITE_MOCK=1` |

## Penamaan

- File: `kebab-case.ts(x)`. Komponen: `PascalCase`. Hook: `useSesuatu`. Konstanta modul: `UPPER_SNAKE`.
- Istilah domain memakai Bahasa Indonesia yang dipakai toko (`kasbon`, `curah`, `shift`, `struk`); kode lain memakai Bahasa Inggris (`cart`, `payment`, `total`). Satu konsep, satu nama di seluruh kode.
- Teks yang dilihat pengguna selalu Bahasa Indonesia dan ditulis persis seperti di spec/rencana.

## Data & logika

- Uang: bilangan bulat rupiah (`Number.isSafeInteger`). Jumlah: `qtyBase` bilangan bulat dalam satuan dasar. Pembulatan setengah ke atas, hanya lewat helper di `shared/lib/`.
- Server otoritatif: UI menghitung untuk pratinjau, server yang menentukan total.
- State server lewat TanStack Query (hook hasil orval); state UI lokal di komponen; state lintas komponen yang harus bertahan (keranjang) di Zustand. Jangan menyalin data server ke store.
- Error API ditangani lewat `ApiError.code`; teks pesan dari `pesanError()`.

## UI

- Warna hanya dari token di `app/styles.css`; tidak ada warna Tailwind bawaan.
- Tombol tinggi minimal 44px; fokus selalu terlihat; dialog memakai komponen Radix.
- Interaksi: umpan balik muncul saat tombol **ditekan** (bukan dilepas); animasi hanya `transform` dan `opacity`; hormati `prefers-reduced-motion`; sheet/popover muncul dari arah pemicunya; label tombol spesifik ("Simpan harga", bukan "OK").
- Kasir: tanpa tombol F; pintasan hanya `Enter`, `Esc`, `↑`, `↓`, `Delete`.

## Performa

- `/kasir` dan `/owner` dimuat terpisah (lazy route); jangan mengimpor kode owner dari kasir atau sebaliknya.
- Anggaran ukuran gzip dicek `npm run size:check` (utama 130 KB, kasir 50 KB, owner 50 KB, chunk lain 25 KB, total 220 KB). Melampaui anggaran berarti perlu alasan dan menaikkan anggaran secara sadar di commit tersendiri.
- Daftar panjang (keranjang, riwayat, barang) memakai kunci stabil dan tidak merender ulang semua baris saat satu baris berubah.

## Test

- Logika di `shared/lib/` dan aturan bisnis di `mocks/handlers/`: test tabel dengan angka persis.
- Komponen: Testing Library, dari sudut pandang pengguna (`getByRole`, teks yang terlihat); tanpa mengetes detail implementasi.
- Alur penting: Playwright (`web/e2e/`), termasuk pemeriksaan aksesibilitas dan larangan request ke luar.
- Test ditulis sebelum kode (TDD). Keluaran test harus bersih tanpa peringatan.

## Pemeriksaan otomatis (harus hijau sebelum merge)

`npm run lint` · `npm run typecheck` · `npm run knip` · `npm run gen:check` · `npm test` · `npm run build` · `npm run size:check` · `npm run e2e`

## Commit

Gaya conventional (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`), Bahasa Indonesia boleh, satu perubahan logis per commit, author identitas git sendiri.
