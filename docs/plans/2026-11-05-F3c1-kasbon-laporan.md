# Rencana F3c-1 — Kasbon pemilik, Pelunasan di kasir, Kasir tanpa PIN pemilik, dan Laporan: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Pra-cek Opus 5 Nov 2026 + Ruling pemilik R1–R11:** bagian yang diubah/ditambah pra-cek ditandai **(pra-cek)**, yang berasal dari ruling ditandai **(ruling R…)** di judul task / butir. Pemeriksa ulang cukup membaca bagian bertanda itu. Salinan rencana sebelum pra-cek ada di scratchpad sesi (bukan di repo).

**Goal:** Pelanggan melunasi kasbon di kasir (Tunai/QRIS, sebagian boleh, cicilan melunasi kasbon tertua dulu, kembalian seperti tab Tunai, struk opsional mengikuti `autoPrint`) atau langsung ke pemilik (Transfer/Tunai ke pemilik, tidak pernah masuk laci); tunai yang diterima kasir menambah uang seharusnya di tutup shift ("Pelunasan kasbon +Rp…"). **Tidak ada lagi tindakan kasir yang butuh PIN pemilik** (ruling R1/R5): batal transaksi dan batal pelunasan hanya untuk shift yang sedang buka dengan alasan wajib, kasbon boleh melewati limit dengan alasan wajib; semuanya tercatat (siapa, jam, nominal, alasan) dan menjadi butir "Perlu perhatian" yang menumpuk sejak terakhir ditinjau; transaksi & pelunasan dari shift yang sudah tutup dibatalkan dari app pemilik. Pemilik melihat pelanggan berutang urut saldo dengan ringkasan umur, riwayat, mengatur limit, mencatat pelunasan langsung, dan membuka tab **Laporan**: omzet & laba kotor per periode dengan pembanding sepanjang rentang yang sama, grafik Health bersama Beranda, paling laku, per kategori, per kasir, tidak terjual ≥ 30 hari, untung tipis, dan selisih opname per barang dengan "bertugas" (pengaman 4). **Ekspor Excel/PDF pindah ke F3c-2** (pra-cek, agar F3c-1 tetap ±15 task).

**Architecture:** Contract-first (orval). Pelunasan = satu skema dua jalur (`channel: kasir | pemilik`): kasir di `/api/credit-payments` (sesi kasir, shift buka), pemilik di `/api/owner/customers/…`. Buku kasbon tetap append-only (`creditLedger`); pelunasan disimpan sebagai rekaman (`creditPayments`) yang hanya berubah di field batal & `printStatus`; uang laci dicatat di `MockShift.creditCash` (pola `cashOuts`). **Pembagian pembatal (pra-cek, ruling R2/R4):** setiap transaksi/pelunasan jalur kasir punya `shiftId`; kasir hanya membatalkan milik shift yang sedang buka (laci dikoreksi di shift itu), app pemilik hanya membatalkan milik shift yang sudah tutup atau jalur pemilik (laci **tidak pernah** dikoreksi dari app pemilik). Pengecualian kasir (batal transaksi, batal pelunasan, kasbon lewat limit) adalah **tampilan turunan** dari data penjualan & pelunasan yang sudah menyimpan pelaku/alasan, plus penanda "terakhir ditinjau" per jenis di state. Laporan dihitung server dari penjualan yang menyalin HPP per baris (`MockSale.lineCosts`); aturan periode & pembanding = fungsi murni bersama di `shared/lib/report-period.ts`. Grafik Beranda diangkat menjadi `HealthChart` dua seri di `features/owner/common/health-chart/`; `HourlyChart` Beranda tinggal adaptor tipis.

**Tech Stack:** (tetap) React 19, TS strict, TanStack Router/Query, orval + zod/mini, MSW 2, Tailwind 4 tokens, lucide-react, Vitest + Testing Library, Playwright + axe. Tanpa dependensi baru.

**Spec:** `docs/specs/2026-10-17-frontend-design.html` §8 (baris Laporan & Kasbon), §5 (aturan bayar tunai/QRIS), §7 (tutup shift buta), §12b (gaya pemilik), §12c (kasir; layar kasir **masih gaya sekarang**; baris PIN pemilik dihapus oleh ruling R5), §12e (integrasi tutup shift, pengaman 4), §12f baru (ditulis di T0); `docs/PRD.html` K-08, K-09, K-10, P-07, P-08, P-09; arsitektur §5 (uang int, `round_half_up`, `credit_ledger` append-only, waktu UTC ms, hari bisnis WIB) dan §9 (HPP & laba tidak pernah ke sesi kasir/staf); `docs/conventions.md` termasuk "Daftar periksa UI pemilik". **Mockup yang sudah ada (pra-cek):** `.superpowers/brainstorm/1747-1793890982/content/laporan-v3.html` (dengan koreksi P6, P10, P11), `kasbon-v1.html` (tab Kasbon, detail pelanggan, `Catat pelunasan`, `Atur limit`), `pelunasan-kasir-v1.html` (tombol header, lembar Tunai/QRIS, galat, Riwayat + batal, struk, tutup shift); kerangka `docs/specs/assets/_kerangka-pemilik.html`. **Keputusan pemilik P1–P20 dan Ruling R1–R11 (5 Nov 2026)** mengikat dan mengalahkan butir spec yang bertabrakan; bila P dan R bertabrakan, **R yang berlaku**.

## Keputusan pemilik (5 Nov 2026)

- **P1 Pembagian:** F3c-1 = Kasbon pemilik + pelunasan kasir + Laporan. Lainnya (Shift & kas, Kasir, Pengaturan, Log aktivitas, antrean kasir), pengaman 5, dan sisa F3b-2b = **F3c-2**. (Alasan void kini disimpan di F3c-1 — ruling R4.)
- **P2 Standar:** layar & mockup pemilik dicocokkan dengan "Daftar periksa UI pemilik" (conventions) dan dimulai dari `_kerangka-pemilik.html`; laporan agent menyebut butir yang dicek dan yang sengaja menyimpang.
- **P3 Laba:** hanya laba kotor (omzet − HPP yang disalin saat jual).
- **P4 Periode:** Hari / Minggu / Bulan / Tanggal. Pembanding rentang sama panjang: bulan berjalan 1–5 Nov vs 1–5 Okt; minggu sama; Hari vs hari yang sama minggu lalu. Teks pola Beranda (`▲ 8% dari 1–5 Okt`).
- **P5 Grafik:** pita omzet C4 + grafik Health dengan legenda Omzet/Laba kotor; Hari = per jam seperti Beranda; kontrak a11y Beranda. Tes Beranda dan grup E2E `Omzet per jam hari ini dan {Hari} lalu` tetap hijau **tanpa mengubah asersi**.
- **P6 Angka kunci:** 4 kartu 2×2 terpisah; **keempatnya** punya baris pembanding (tinggi rata).
- **P7 Paling laku:** beranda laporan 3 teratas urut omzet; `Lihat semua` dengan urut Omzet / Jumlah / Laba; ada tes urutan.
- **P8 Tidak terjual ≥ 30 hari:** patokan terakhir terjual, atau stok pertama bila belum pernah; tidak ikut stok 0, stok minus, nonaktif, menunggu harga, baru < 30 hari. Tanpa HPP → `HPP belum ada`, tidak dijumlah, catatan `{n} barang belum ada HPP`.
- **P9 Rincian:** Per kategori, Per kasir (omzet, transaksi, dibatalkan), Selisih opname (pengaman 4, di bawah Per kasir), Untung tipis.
- **P10 Untung tipis:** batas 10%; margin = (harga jual − HPP) ÷ harga jual **dari harga eceran**; urut margin tertipis; tidak masuk Perlu perhatian; tanpa HPP tidak ikut; tanda oranye ikon + teks. Batas di state server; layar Pengaturan di F3c-2.
- **P11 Pengaman 4 "bertugas":** kasir yang shift + orang toko yang punya catatan barang itu di antara dua hitungan; urut nama. "Berulang" = kurang di ≥ 2 hitungan berturut-turut. "Petunjuk, bukan bukti".
- **P12 Ekspor:** Excel dibuat server Go; PDF lewat cetak browser. **(pra-cek) Dikerjakan di F3c-2** — lihat Catatan untuk F3c-2.
- **P13 Seed:** modal acak 85–93% harga (sudah ada); riwayat contoh diperpanjang.
- **P14 Jalur bayar:** satu kontrak untuk dua jalur: kasir (ke laci) dan pemilik langsung (tidak masuk laci).
- **P15 Kasir:** metode Tunai / QRIS; hanya Tunai masuk laci + baris tutup shift `Pelunasan kasbon +Rp…`. Metode disimpan per pelunasan.
- **P16 Jumlah:** boleh sebagian; maks. = sisa kasbon; uang diterima lebih → kembalian seperti tab Tunai.
- **P17 Batal pelunasan:** ~~PIN pemilik~~ → **digantikan R2** (alasan wajib, tanpa PIN).
- **P18 Struk pelunasan:** hanya jalur kasir; sisa kasbon tercantum; ~~bawaan tidak dicentang~~ → **digantikan R8** (ikut `autoPrint`).
- **P19 Gaya kasir sekarang;** lembar pelunasan ditambahkan ke §12c "Yang berubah".
- **P20 Risiko:** tutup shift = Opus + re-review; lembar pelunasan kasir & detail pelanggan pemilik + re-review (CLAUDE.md K-UANG menjadikannya Opus); grafik bersama + re-review; HPP per baris sebelum laporan.

## Ruling pemilik (review mockup Kasbon/Pelunasan, 5 Nov 2026) — MENGIKAT (ruling R1–R11)

Mengubah spec **F2 §12c** (baris "PIN & kunci layar": PIN pemilik untuk batal/retur & melewati limit; baris Riwayat "butuh PIN pemilik"), **F3b-2a/F3b-2b §12e** (R10, dikerjakan F3c-2), PRD K-08/K-10 (PIN pemilik → alasan), dan carry-over Go (aturan PIN pemilik di void/kredit usang). Pembaruan dokumen dikerjakan di task pemilik perubahannya (T0, T2b, T4) — lihat langkah dokumen di task itu.

- **R1 Prinsip:** toko tetap jalan walau pemilik tak bisa dihubungi seharian. Tidak ada transaksi kasir yang butuh PIN pemilik. Pengecualian kasir: boleh jalan + alasan wajib + tercatat (siapa, jam, nominal, alasan) + butir "Perlu perhatian" sampai ditinjau.
- **R2 Batal pelunasan:** kasir boleh batal di shift yang sedang buka; setelah shift tutup hanya dari app pemilik. Tercatat pembatal (bisa beda dari pencatat), jam, nominal, metode, alasan. Riwayat pelanggan: baris dicoret + `Dibatalkan` + alasan + nama + jam. Batal tunai di kasir mengurangi uang seharusnya shift yang buka.
- **R3 Kasbon lewat limit:** limit = batas peringatan; kasir boleh lewat dengan alasan wajib; tercatat pelanggan, nominal lewat limit, kasir, alasan; butir "Perlu perhatian".
- **R4 Batal transaksi:** tanpa PIN, alasan wajib, hanya transaksi shift yang sedang buka. Alasan, pelaku (id + nama), jam server **disimpan di rekaman penjualan** dan tampil di detail transaksi pemilik (menutup carry-over F2 "alasan void tidak disimpan"). Transaksi shift yang sudah tutup: batal dari app pemilik (tombol baru di detail transaksi pemilik). Tercatat + "Perlu perhatian".
- **R5 PIN pemilik hilang dari kasir:** hapus `OwnerPinDialog` dan field `ownerPin` dari kontrak kasir; perbarui §12c dan carry-over Go.
- **R6 Cicilan FIFO:** pelunasan melunasi kasbon tertua dulu (sudah perilaku `oldestUnpaidAt`; dikunci tes).
- **R7 Tebakan mockup disetujui:** umur = kasbon belum lunas tertua (FIFO); pelanggan lunas tidak tampil kecuali dicari; limit boleh di bawah sisa + keterangan bahwa kasbon baru akan melewati limit dan butuh alasan; tombol pelunasan bisa dipakai saat keranjang berisi — keranjang tidak berubah, scan diabaikan selama lembar terbuka.
- **R8 Struk pelunasan:** hanya jalur kasir; kotak `Cetak struk` ikut `autoPrint` toko seperti jendela bayar. Jalur pemilik tanpa struk.
- **R9 Tinjau tidak teratur:** butir "Perlu perhatian" batal pelunasan, batal transaksi, kasbon lewat limit **menumpuk sejak terakhir ditinjau** dan bertahan sampai ditinjau; tampilkan rentang tanggalnya. Log aktivitas (F3c-2) minimal 90 hari + paginasi.
- **R10 Harga jual sementara dari orang toko** → **F3c-2** (pra-cek; lihat Catatan untuk F3c-2).
- **R11 (Opsional) "Ragu? Telepon pemilik: {nomor}"** → **F3c-2** (nomor dari Pengaturan toko yang baru ada di F3c-2).

## Jawaban pemilik atas pertanyaan rencana + ruling R12 (5 Nov 2026) — MENGIKAT (jawaban pemilik)

- **J0 Riwayat kasir = shift yang sedang buka** (bukan "hari ini"; shift bisa lewat tengah malam). `listTodaySales` → `listShiftSales` (`GET /api/sales/shift`), pelunasan `GET /api/credit-payments/shift` (`listShiftCreditPayments`); tanpa shift buka → `[]`. Judul `Riwayat shift ini`†, kosong `Belum ada transaksi di shift ini`†.
- **Q1** Batal dari app pemilik **tidak pernah** mengubah laci; pemilik hanya membatalkan item shift yang sudah tutup (dan pelunasan jalur pemilik). = K5/K30.
- **Q2** Lainnya > `Transaksi` (cari nomor struk → detail → Batalkan) tetap di F3c-1 (T7b).
- **Q3** Ekspor Excel/PDF → F3c-2 (bersama R10, R11).
- **Q4** Pelunasan QRIS: satu tombol `Sudah masuk`, sama dengan jendela bayar.
- **Q5** Kartu laba: label `Laba kotor · {16,4}%`, baris bawah = pembanding. Margin dari server (`SalesTotals.marginPermille`, T9); omzet 0 → label `Laba kotor` saja.
- **Q6** Grafik periode Hari: omzet & laba kotor per jam.
- **Q7** Bulan lewat (penuh) vs bulan penuh sebelumnya; bulan berjalan memakai tanggal sejajar; bila bulan pembanding lebih pendek, tanggal sejajar dijepit ke akhir bulan itu (1–30 Mar vs 1–28 Feb). (jawaban pemilik, keputusan pembangun) Potongan "akhir menit sekarang" hanya berlaku bila hari terakhir pembanding **sejajar** dengan hari ini; bila dijepit (pembanding sudah habis), hari terakhir pembanding dihitung penuh.
- **Q8** Pemilik boleh membatalkan transaksi kasbon lama yang sudah dicicil → saldo boleh minus, tampil `Lebih bayar {Rp}`; pelunasan yang sudah diterima tidak dipaksa batal; kasbon berikutnya memotong lebih bayar dulu (otomatis: saldo = Σ buku, FIFO `paid` sisa memakan kasbon baru); umur kasbon & butir Beranda memperlakukan saldo ≤ 0 sebagai tanpa utang. `totalBalance`/`ages`/`debtorCount` hanya menjumlah saldo > 0.
- **R12 (ruling R12) Pengembalian keesokan hari oleh kasir:** Riwayat kasir punya `Cari nomor struk` untuk transaksi dari shift yang sudah tutup, maks. 7 hari ke belakang. Kasir boleh membatalkannya dengan alasan wajib; **bagian tunai** keluar dari laci shift yang **sedang buka** (baris `MockShift.saleRefunds`, uang seharusnya turun — pola koreksi nota F3b-2a); bagian QRIS dikembalikan di luar laci; bagian kasbon dibalik di buku (saldo boleh minus, Q8); stok kembali; tercatat + "Perlu perhatian" (`batal_transaksi`, `fromClosedShift: true`). Shift lama tidak pernah diubah. Batas 7 hari (keputusan pembangun) = **hari kalender WIB**: boleh bila `isoDaysBetween(jakartaIsoDate(sale.createdAt), hari ini) ≤ 7` (jual Kamis 29 Okt 00.00 WIB → boleh pada Kamis 5 Nov 23.59; jual Rabu 28 Okt 23.59 → ditolak), selain itu 409 `VOID_TOO_OLD` (`Transaksi lebih dari 7 hari — batalkan dari app pemilik`†) dan hanya app pemilik (tanpa laci). Tanpa shift buka → 409 `SHIFT_CLOSED` (uang tidak punya laci tujuan). **Batal pelunasan tetap R2** (kasir hanya pelunasan shift yang sedang buka; tidak bertabrakan — R12 hanya menyebut transaksi jualan).

## Global Constraints

- Semua constraint F1–F3b-2b tetap, kecuali yang diubah ruling R1–R9. Pemeriksaan wajib hijau tiap task: `lint`, `typecheck`, `knip`, `gen:check`, `test`, `build`, `size:check`. `e2e` dijalankan **controller** setelah tiap gelombang digabung.
- **Anggaran bundle (gzip, 5 Nov 2026, `adc8b5c`):** utama 123,0/130, kasir 22,2/50, owner 34,9/50, staff 28,6/50, `problem-` 23,9/25, **total 249,5/270 KB** (total = Σ semua chunk). T1 menerapkan entri `problem-` 30 KB. (pra-cek) Laporan + Kasbon + Transaksi pemilik diperkirakan menambah owner ±15–22 KB: pemecahan chunk tidak mengurangi **total**, jadi total paling mungkin terlampaui lebih dulu → aturan K23.
- **HPP & laba tidak pernah ke sesi kasir/staf.** Respons `/api/credit-payments*`, `/api/customers*`, `/api/sales*` hanya memuat key allowlist (diuji `expectTypeOf<keyof …>` di `contract.test.ts` + `deepKeys` MSW, pola `FORBIDDEN_STAFF_KEYS`); tidak ada `cost`, `costTotal`, `lineCosts`, `grossProfit`, `unitCost`, `heldValue`, `value`, `lossValue`, `gainValue`, juga tidak ada `voidReason`/`creditOverLimit` (data pengecualian hanya untuk pemilik).
- Uang & `qtyBase` bilangan bulat; pembagian lewat `roundHalfUp`; persen margin dalam permil bulat (K18).
- **Append-only:** `creditLedger` (+ kasbon, − pelunasan/batal kasbon, + pembalik batal pelunasan dengan `paymentId` sama), `MockShift.creditCash`, `MockShift.cashOuts`. `creditPayments` hanya berubah di field `cancelled*` dan `printStatus`; penjualan hanya berubah di `status`, `printStatus`, `voided*`. `customer.balance` hanya lewat `appendCredit`.
- Waktu kejadian = epoch ms UTC **dari jam server** (bukan dari body); tanggal kalender & batas hari/minggu/bulan = Asia/Jakarta. Minggu = Senin–Minggu.
- Idempotensi pelunasan per `(createdById, id)` seperti nota/opname: id milik pengguna lain → 409 `ID_TAKEN`; replay → 200 rekaman tersimpan, tanpa entri buku/laci kedua. Batal (transaksi/pelunasan) yang sudah batal → 200 tanpa perubahan.
- **(ruling R1/R5) Tidak ada `ownerPin` di kontrak mana pun** setelah T2b; login PIN kasir/staf (`PIN_INVALID`, `LOCKED_OUT`) tetap.
- Gaya pemilik §12b + daftar periksa 1–16; layar kasir gaya sekarang (`Dialog`, `MoneyField`, `CashFields`, `ChangeLine`, `QrisPanel`, `CustomerPicker`). Tanda status = ikon lucide + teks. Tombol ≥ 44 px, sheet/dialog Radix, fokus kembali ke pemicu (kasir: `focusScanBox()`).
- Fitur tidak saling import; aturan yang dipakai mock + app ada di `shared/lib/credit-rules.ts` (T2) dan `shared/lib/report-period.ts` (T9).
- Fixture test yang hanya **ditambah field wajib baru** (mis. `creditPayments` di `ShiftClosure`, `exceptions` di `Attention`, `shiftId` di `Sale`) bukan perubahan asersi; perubahan asersi hanya di tes yang disebut per task sebagai "berubah karena ruling".
- Proses agent: worktree diberi SHA dasar persis dan `git reset --hard <sha>`; laporan ke scratchpad sesi; paket review tanpa `web/src/shared/api/gen`; agent selesai di-TaskStop lalu worktree di-unlock & dihapus; file sementara hanya di scratchpad.
- Commit: conventional, Bahasa Indonesia, **tanpa** baris `Co-Authored-By` atau jejak alat lain.

### Teks UI

Pakai persis; `{…}` diisi; `—` = em dash; `−` = U+2212 (uang bertanda laporan memakai `formatSignedRupiah`, T9); `–` = en dash rentang; **†** = teks pilihan rencana (belum ada di mockup); **M** = dari mockup yang sudah ada. Teks kasir lama dipakai ulang apa adanya kecuali yang diganti ruling. **(pra-cek)** Teks diselaraskan ke mockup; perbedaan yang dipilih rencana dicatat di akhir rencana; (jawaban pemilik) pertanyaan Q1–Q8 sudah dijawab.

| Kunci | Teks |
|---|---|
| metode | `tunai` `Tunai` · `qris` `QRIS` · `transfer` `Transfer` · `titip` `Tunai ke pemilik` **M** |
| kasir: tombol | header, sebelum `Riwayat`, hanya saat shift buka: `Pelunasan kasbon` **M** |
| kasir: lembar | judul `Pelunasan kasbon` **M** + `Esc untuk menutup` **M**; label `PELANGGAN` **M**; pemilih = `CustomerPicker` mode pelunasan (tanpa `Tambah pelanggan`, hanya pelanggan bersisa, info `Sisa kasbon {Rp} · Limit {Rp}` **M**; kosong `Tidak ada pelanggan dengan kasbon`†); isian `NOMINAL PELUNASAN` **M** + tombol `Lunas semua` **M**; tab `Tunai` · `QRIS`; Tunai = `CashFields` (tagihan = nominal); QRIS = `QrisPanel`; baris `Sisa kasbon setelah ini {Rp}` **M** (0: `Rp0 · lunas` **M**); galat `Jumlah minimal Rp1`† · `Melebihi sisa kasbon {Rp}` **M** (ikon peringatan) · uang kurang = `KURANG Rp…` (ChangeLine lama); kaki `Cetak struk` (bawaan = `autoPrint`, R8), `Batal`, utama `Simpan pelunasan` **M** (Tunai) / `Sudah masuk` (QRIS, satu langkah seperti jendela bayar — jawaban pemilik Q4); replay `Pelunasan ini sudah tersimpan sebelumnya`† |
| kasir: hasil | (tidak ada di mockup — †) judul `Pelunasan tersimpan`; `ChangeLine` (Tunai, kembalian > 0); `Sisa kasbon {Rp}`; tombol `Tutup` (Enter) |
| kasir: Riwayat | **(jawaban pemilik J0)** judul `Riwayat shift ini`†, kosong `Belum ada transaksi di shift ini`†; isi = transaksi & pelunasan **shift yang sedang buka**. **(pra-cek, mockup)** pelunasan **berselang-seling dengan transaksi** urut jam (terbaru dulu): baris `Pelunasan · {nama}` / `{metode} {HH.MM} · sisa {Rp}` kanan `{Rp}` + `Dibatalkan`; tombol `Cetak ulang` (teks tombol lama; mockup `Cetak`) aria `Cetak ulang pelunasan {nama} {HH.MM}`† · `Batalkan` aria `Batalkan pelunasan {nama} {HH.MM}`†; toast `Pelunasan dibatalkan`† |
| kasir: cari struk lama (ruling R12) | bagian bawah Riwayat `Transaksi shift sebelumnya`†; isian `Cari nomor struk`† (cocok sebagian, mis. `0145` atau `20261104-0145`); keterangan `Maksimal 7 hari ke belakang`†; baris `{nomor} · {d Mmm HH.MM}` / `{metode} · {kasir}` kanan `{Rp}` + `Dibatalkan`; tombol `Batalkan` aria `Batalkan {nomor}`; tanpa hasil `Tidak ada transaksi dengan nomor itu dalam 7 hari`†; dialog `Batalkan {nomor}?`† isi (bila ada tunai — cek ulang 2) `Tunai {Rp} dikembalikan dari laci shift ini.`† (+ bila ada QRIS `QRIS {Rp} dikembalikan di luar laci.`†, bila ada kasbon `Kasbon {nama} dikurangi {Rp}.`†) + `Alasan`; toast `Transaksi dibatalkan`; 409 `VOID_TOO_OLD` → `Transaksi lebih dari 7 hari — batalkan dari app pemilik`† |
| kasir: batal pelunasan (ruling R2) | dialog `Batalkan pelunasan {Rp}?` **M**; isi Tunai `Kasbon {nama} bertambah lagi {Rp} dan uang {Rp} dikeluarkan dari laci.`† · QRIS `Kasbon {nama} bertambah lagi {Rp}.`† (mockup menulis sisa hasil; tidak dipakai karena saldo terkini tidak dimiliki kasir); isian `Alasan` (wajib); tombol `Kembali` **M** · `Batalkan pelunasan`† |
| kasir: batal transaksi (ruling R4) | dialog `Batalkan {nomor}?`†; isi `{metode} · {Rp}`; isian `Alasan` (wajib); tombol `Kembali` · `Batalkan transaksi`†; toast lama `Transaksi dibatalkan` (Riwayat hanya berisi shift yang sedang buka — J0) |
| kasir: kasbon lewat limit (ruling R3) | tab Kasbon: teks lama `Melebihi limit — perlu PIN pemilik` → `Melebihi limit — perlu alasan`†; dialog `Kasbon melewati limit`†; isi `{nama}: sisa {Rp} + kasbon ini {Rp} melewati limit {Rp} sebesar {Rp}.`†; isian `Alasan`; tombol `Kembali` · `Simpan dengan alasan`† |
| kasir: struk pelunasan | **M** `{NAMA TOKO}` / alamat / `PELUNASAN KASBON` / `{dd/mm/yyyy HH.MM} · Kasir: {nama}` / `Pelanggan: {nama}` / `Sisa sebelum` · `Dibayar ({metode})` · `Sisa kasbon` · (Tunai) `Uang diterima` · `Kembalian` / footer struk toko |
| kasir: tutup shift | baris `Pelunasan kasbon` `+Rp…` (`signedRupiah` dialog), **di atas `Bayar supplier`** **M**; (ruling R12) baris `Pengembalian transaksi lama`† `-Rp…` di bawah `Bayar supplier`; masing-masing tidak tampil bila 0 |
| Kasbon (tab) | **(pra-cek, mockup)** kartu `Total kasbon` `{Rp}` / `{n} pelanggan` lalu tiga baris `0–7 hari` · `8–30 hari` · `Lebih dari 30 hari` masing-masing `{k} pelanggan` kanan `{Rp}` (baris `Lebih dari 30 hari` bertanda warn ikon Clock + teks bila k > 0); cari `Cari nama atau nomor HP`; bagian `Pelanggan` kanan `urut sisa terbesar`; baris `{nama}` / `{n} hari · limit {Rp}` kanan `{Rp}` (umur > 30 hari: tanda warn ikon + `{n} hari`); pelanggan lunas hanya tampil saat dicari, keterangan `Lunas · limit {Rp}`†; (jawaban pemilik Q8) saldo < 0 tampil di daftar setelah yang berutang, kanan `Lebih bayar {Rp}`†, tidak masuk total & kelompok umur; kosong `Belum ada kasbon`†; cari tanpa hasil `Tidak ada pelanggan yang cocok`† |
| detail pelanggan | kembali `Kasbon`; eyebrow `{no. HP}`; judul `{nama}`; kartu `Sisa kasbon` `{Rp}` / `Limit {Rp} · kasbon tertua {n} hari` (saldo 0: `Limit {Rp}`; (jawaban pemilik Q8) saldo < 0: kartu `Lebih bayar` `{Rp}` / `Limit {Rp}`†); tombol `Catat pelunasan` (nonaktif bila saldo ≤ 0) · `Atur limit`; bagian `Riwayat`; baris kasbon `Kasbon · struk {nomor}` / `{Rab, 4 Nov} {14.32} · {kasir}` kanan `+{Rp}` (seed tanpa struk: `Kasbon` / `{tanggal jam}`); baris pelunasan `Pelunasan · {metode} di kasir` atau `Pelunasan · {metode} ke pemilik` / `{tanggal jam} · {pencatat}` kanan `−{Rp}`; dibatalkan: dicoret + tanda (Undo2, neutral) `Dibatalkan` + bawah `{alasan} · {pembatal} · {relativeDayTime}` (ruling R2); kosong `Belum ada riwayat`† |
| catat pelunasan (pemilik) | **M** judul `Catat pelunasan`; `Sisa kasbon {Rp}`; isian `Nominal` + `Lunas semua`; `Cara bayar` `Transfer` · `Tunai ke pemilik`; catatan `Tidak masuk laci kasir.`; `Sisa setelah ini {Rp}`; tombol `Simpan pelunasan`; toast `Pelunasan tersimpan`†; galat `Melebihi sisa kasbon {Rp}` |
| atur limit | **M** judul `Atur limit`; isian `Limit kasbon`; catatan `Sisa kasbon sekarang {Rp}.` + bila limit < sisa `Kasbon baru di kasir akan melewati limit dan perlu alasan.`† (ruling R7; mockup lama menyebut PIN); tombol `Simpan limit`; toast `Limit disimpan`†; galat `Limit harus bilangan bulat minimal 0`† |
| batal pelunasan (pemilik) | ketuk baris pelunasan aktif (**M**) → lembar `Pelunasan {Rp}`† dengan tombol `Batalkan pelunasan`†; dialog `Batalkan pelunasan ini?`† / `{Rp} dari {nama}, {d Mmm HH.MM}. Sisa kasbon menjadi {Rp}.`† + (jalur kasir Tunai) `Uang dikembalikan pemilik; laci kasir tidak berubah.`†; isian `Alasan`; tombol `Batalkan pelunasan` · `Kembali`; pelunasan kasir di shift yang masih buka: tombol tidak ada, keterangan `Masih di shift yang buka — batalkan dari kasir`†; toast `Pelunasan dibatalkan` |
| Perlu perhatian (ruling R9) | `{n} transaksi dibatalkan kasir`† / `{rentang} · {Rp}`; `{n} pelunasan dibatalkan kasir`† / `{rentang} · {Rp}`; `{n} kasbon lewat limit`† / `{rentang} · lewat {Rp}`; `{rentang}` = `5 Nov` atau `2–5 Nov` atau `28 Okt–5 Nov` |
| tinjau pengecualian | kembali `Beranda`; eyebrow `Sejak ditinjau {d Mmm yyyy HH.MM}`† / `Belum pernah ditinjau`†; judul = teks butir tanpa angka (`Transaksi dibatalkan kasir`† dst.); baris `{nomor} · {kasir}` atau `{pelanggan} · {kasir}` / `{alasan}` kanan `{Rp}` + bawah `{relativeDayTime}`; tombol `Tandai sudah ditinjau`†; toast `Ditandai sudah ditinjau`†; kosong `Tidak ada yang perlu ditinjau`† |
| transaksi (pemilik) | baris Lainnya `Transaksi`†; halaman `Transaksi`† eyebrow tanggal, navigator hari `Hari sebelumnya`/`Hari berikutnya`†, cari `Cari nomor struk`†; baris `{nomor} · {HH.MM}` / `{metode} · {kasir}` kanan `{Rp}` + `Dibatalkan`; detail: judul `{nomor}`, eyebrow `{tanggal jam} · {kasir}`, daftar barang, pembayaran, (dibatalkan) kartu `Dibatalkan` / `{alasan} · {nama} · {relativeDayTime}`; tombol `Batalkan transaksi`† (hanya shift sudah tutup; shift buka: `Masih di shift yang buka — batalkan dari kasir`†); dialog `Batalkan {nomor}?`† / `Stok dikembalikan dan kasbon dibatalkan. Uang dikembalikan pemilik; laci kasir tidak berubah.`† + `Alasan`; toast `Transaksi dibatalkan` |
| Laporan: periode | segmen `Hari` `Minggu` `Bulan` `Tanggal`; navigator aria `Periode sebelumnya`† / `Periode berikutnya`†; label `Kamis, 5 Nov 2026`† · `2–8 Nov 2026`† · `November 2026` · `10 Okt–5 Nov 2026`†; Tanggal: lembar `Pilih tanggal`† isian `Dari`† `Sampai`† tombol `Tampilkan`†; galat `Rentang maksimal 92 hari`† · `Tanggal akhir sebelum tanggal awal`† · `Tanggal di masa depan`† · `Periode tidak cocok`† |
| Laporan: kartu | pita `Omzet {rentang}` + pil pembanding; judul grafik `Omzet & laba kotor per hari` / `Omzet & laba kotor per jam`†; kalimat `Paling ramai {Rabu, 4 Nov} · {Rp12,3 jt}` / `Paling ramai jam {10.00} · {Rp…}`† / `Belum ada penjualan di periode ini`†; legenda `Omzet` `Laba kotor`; grup aria `Omzet dan laba kotor per hari, {rentang}`† / `… per jam, {rentang}`†; tabel sr-only caption `Omzet dan laba kotor`† kolom `Tanggal`† / `Jam`, `Omzet`, `Laba kotor` |
| Laporan: angka kunci | (jawaban pemilik Q5) `Laba kotor · {16,4}%` (omzet 0: `Laba kotor`) · `Transaksi` · `Rata-rata / struk` · `Kasbon baru`, masing-masing baris bawah = pembanding |
| pembanding | `▲ {p}% dari {label}` · `▼ {p}% dari {label}` · `Sama dengan {label}` · `Belum ada data {label}` · `{nilai} di {label}`† (K13) |
| Laporan: daftar | `Paling laku` + tautan `Lihat semua`; baris `{peringkat}` `{nama}` / `{jumlah}` kanan `{Rp}`; kosong `Belum ada penjualan`†; `Tidak terjual ≥ 30 hari` baris `{n} barang` / `Modal tertahan {Rp}` (0 barang: `Semua barang terjual dalam 30 hari terakhir`†); baris `Per kategori` · `Per kasir` · `Selisih opname` (kanan `−{Rp}`, 0: `Rp0`) · `Untung tipis` (tanda warn `{n} barang`, 0: `Tidak ada`†). (Bagian `Ekspor` mockup v3 → F3c-2.) |
| Paling laku | kembali `Laporan`; eyebrow `{rentang}`; judul `Paling laku`; segmen `Omzet` `Jumlah` `Laba`; kanan: Omzet `{Rp omzet}` · Jumlah `{jumlah}` (bawah `{Rp omzet}`) · Laba `{Rp laba}` / `HPP belum ada`† |
| Per kategori | judul `Per kategori`; baris `{kategori}` / `{n} barang · laba {Rp}`† kanan `{Rp omzet}`; `Tanpa kategori` |
| Per kasir | judul `Per kasir`; baris `{nama}` / `{n} transaksi · {k} dibatalkan` kanan `{Rp}` |
| Tidak terjual | judul `Tidak terjual ≥ 30 hari`; kartu `Modal tertahan` `{Rp}` / `{n} barang` + tanda warn `{k} barang belum ada HPP`; segmen `Modal terbesar` `Paling lama`; baris `{nama}` / `{n} hari · stok {qty}` · `belum terjual · {n} hari`; kanan `{Rp}` / `HPP belum ada`; kosong `Tidak ada barang yang lama tidak terjual`† |
| Untung tipis | judul `Untung tipis`; lead `Margin di bawah {10}% dari harga eceran`†; baris `{nama}` / `Modal {Rp} · harga {Rp} per {satuan}`† kanan tanda (TrendingDown, warn) `{8,3}%` (minus `−2,1%`); kosong `Tidak ada barang dengan untung tipis`† |
| Selisih opname | eyebrow `{rentang}`; judul `Selisih opname`; kartu `Kurang` `−{Rp}` / `{n} barang` · `Lebih` `+{Rp}` / `{n} barang`; bagian `Per barang`; baris `{nama}` / tanda (Repeat, warn) `Berulang` + `{k} dari {n}` atau `kurang di {k} dari {n} · {−qty}` / `lebih di {k} dari {n} · {+qty}`; kanan `{±Rp}` / `HPP belum ada`†; catatan `Selisih yang sudah diberi alasan tetap dihitung.`; bila ada tanpa HPP `{n} hitungan belum ada HPP`†; kosong `Belum ada selisih opname di periode ini`† |
| detail selisih | kembali `Selisih opname`; eyebrow `{rentang}`; judul `{nama}`; kartu `Kurang` `−{Rp}` / `{−qty} · kurang di {k} dari {n} hitungan` (tanpa kurang: `Lebih` …†); bagian `Bertugas saat kurang` baris `{nama}` kanan `{k} dari {n}`; catatan `Petunjuk, bukan bukti — cocokkan dengan CCTV atau catatan laci.`; bagian `Hitungan`: `{Rab, 4 Nov} · {10.05}` kanan `{±Rp}` / `HPP belum ada`†, bawah `{±qty} · dihitung {nama} · {alasan}` (cocok: `Cocok · dihitung {nama}`†); kotak bertugas (hanya hitungan kurang) `Sejak hitungan {31 Okt}: {Dedi} 1 shift · {Rina} 4 shift, 2 catatan`† / `Hitungan pertama`† / `Tidak ada shift atau catatan`† |

## Review Focus

1. **Respons pelunasan hilang lalu dikirim ulang / klik ganda** → tepat satu pelunasan; buku, saldo, dan `creditCash` berubah sekali; replay isi berbeda mengembalikan rekaman asli. Dites di T2, T4, T7.
2. **Bayar lebih & kembalian** → nominal > sisa (termasuk sisa yang turun karena pemilik mencatat transfer di sela) → 422 `Melebihi sisa kasbon {Rp}` tanpa perubahan; Tunai diterima 100.000 untuk 75.000 → kembalian 25.000 dan laci **+75.000**; QRIS/Transfer/Tunai ke pemilik tidak pernah menyentuh laci. Dites di T2, T3, T4.
3. **(pra-cek, ruling R2/R4/R12, jawaban pemilik Q1) Siapa membatalkan apa** → kasir: pelunasan hanya `shiftId` = shift buka (lainnya 409 `OUTSIDE_SHIFT`), laci dikoreksi di shift itu (net 0); transaksi shift buka → `cashSales` shift itu turun; (ruling R12) transaksi shift tutup ≤ 7 hari kalender WIB → baris `saleRefunds` **bagian tunai saja** di shift yang buka (uang seharusnya turun), shift lama tidak berubah, > 7 hari → 409 `VOID_TOO_OLD` (kedua tepi dites); pemilik: hanya yang shift-nya sudah tutup atau jalur pemilik (shift buka → 409 `IN_OPEN_SHIFT`), **laci tidak pernah dikoreksi**, shift tutup & shift buka tidak berubah; batal dua kali idempoten; umur kasbon kembali ke tanggal lama. Dites di T2, T2b, T3, T5, T7, T7b.
4. **(ruling R1/R3/R4/R9) Pengecualian tercatat & tidak hilang** → batal transaksi menyimpan `voidedAt` (jam server), `voidedById`, `voidedByName`, `voidReason`, `voidChannel` di rekaman (kasir & pemilik); kasbon lewat limit menyimpan selisih & alasan; butir Perlu perhatian menghitung semua sejak `reviewedAt` (termasuk dari minggu lalu); `Tandai sudah ditinjau` memakai `upTo` sehingga kejadian yang masuk setelah daftar dimuat tetap muncul. Dites di T2b, T7b.
5. **Pembanding di batas bulan & periode berjalan (jawaban pemilik Q7)** → 1–5 Nov vs 1–5 Okt; Okt vs Sep 1–30; 1–30 Mar berjalan vs 1–28 Feb (hari terakhir Feb penuh, tanpa potong menit); 1–31 Mei berjalan vs 1–30 Apr; kabisat; pembanding periode berjalan dipotong di menit yang sama; 00.30 WIB masuk hari yang benar; Laporan "Hari ini" = Beranda. Dites di T9.
6. **Jumlah & laba yang menipu** → dus (isi 40) dihitung 80 pcs, curah kg; urut Jumlah satuan eceran; dibatalkan setelah periode tidak dihitung tetapi tercatat di Per kasir; HPP berubah setelah jual tidak mengubah laba lama. Dites di T8, T9.
7. **(jawaban pemilik Q8) Saldo minus** → batal transaksi kasbon yang sudah dicicil → saldo < 0 (`Lebih bayar`), pelunasan tidak ikut batal, kasbon berikutnya memotong lebih bayar dulu, umur null & tidak masuk Beranda/total/kelompok. Dites di T2, T2b, T6, T7.

## Keputusan pembangun di rencana ini (tinjau — boleh dikoreksi)

- **K1 Rute & endpoint:** kasir `/api/credit-payments` (POST), `/shift` (jawaban pemilik J0; bukan `/today`), `/{id}/print`, `/{id}/cancel`; (T2b) `GET /api/sales/shift` menggantikan `/api/sales/today`, `GET /api/sales/lookup?q=` (ruling R12) (tag `credit`, `cookieAuth`); `GET /api/customers` + query opsional `owing=true` (pra-cek: hanya saldo > 0, sebelum batas 20 hasil — filter klien setelah `slice(0, 20)` akan menyembunyikan pelanggan berutang). Pemilik `/api/owner/customers`, `/{customerId}`, `/{customerId}/credit-limit` (PUT), `/{customerId}/payments` (POST), `/api/owner/credit-payments/{paymentId}/cancel`; (ruling) `/api/owner/sales`, `/{saleId}`, `/{saleId}/void`, `/api/owner/exceptions`, `/api/owner/exceptions/review`; laporan `/api/owner/reports/{sales,products,stock,opname,opname/{productId}}`. Rute UI: `/owner/kasbon/$customerId`; `/owner/lainnya/transaksi` + `/$saleId`; `/owner/pengecualian/$kind`; `/owner/laporan` + `/owner/laporan/{paling-laku,kategori,kasir,tidak-terjual,untung-tipis,selisih-opname,selisih-opname/$productId}` dengan search `{periode, dari, sampai}`.
- **K2 Satu skema dua jalur:** `channel: kasir` hanya `tunai | qris`; `channel: pemilik` hanya `transfer | titip`. Masuk laci **hanya** `kasir + tunai` → `MockShift.creditCash`. `ShiftClosure.creditPayments` = Σ `creditCash` shift itu; (ruling R12) `ShiftClosure.saleRefunds` = Σ `MockShift.saleRefunds` (tunai transaksi shift lama yang dibatalkan kasir di shift ini); `expectedCash = openingCash + cashSales − supplierPayments + creditPayments − saleRefunds`. (pra-cek) Karena hanya kasir yang membatalkan pelunasan shift buka, nilainya tidak pernah negatif.
- **K3 Idempoten:** kunci `id` (1..64) global lintas realm; milik pembuat lain → 409 `ID_TAKEN`; milik sendiri → 200 rekaman tersimpan apa adanya (Go: sidik isi).
- **K4 Validasi jumlah:** `1 ≤ amount ≤ saldo`; Tunai `cashReceived ≥ amount`, `change = cashReceived − amount`; QRIS `cashReceived` null → disimpan 0/0. Jalur kasir butuh sesi kasir **dan** shift buka (409 `SHIFT_CLOSED`); rekaman menyimpan `shiftId`. Jalur pemilik tanpa shift (`shiftId` null). `balanceAfter` disalin saat dicatat.
- **K5 Batal (pra-cek, ruling R2):** body `{ reason }` (1..200 karakter setelah trim, wajib, tanpa PIN). (cek ulang) Alasan kosong → 422 diperiksa **sesudah** "sudah batal → 200" dan sebelum cek shift, di kedua jalur (sama dengan void T2b). Kasir: 404 → sudah batal → 200 apa adanya → tanpa shift 409 `SHIFT_CLOSED` → `shiftId` ≠ shift buka 409 `OUTSIDE_SHIFT` → buku +jumlah (`paymentId` sama) dan, bila Tunai, `creditCash` −jumlah `batal_pelunasan` di shift itu. Pemilik: 404 → sudah batal → 200 → jalur kasir dengan `shiftId` = shift buka → 409 `IN_OPEN_SHIFT` → buku +jumlah, **tanpa** baris laci (uang dikembalikan pemilik). Disimpan `cancelledAt` (jam server), `cancelledById`, `cancelledByName`, `cancelledChannel`, `cancelReason`.
- **K6 Umur kasbon (pra-cek, ruling R6/R7):** basis `oldestUnpaidAt` (FIFO) yang mengenali pembalik batal pelunasan. `ageDays = ceil((now − oldest) / DAY_MS)` dan kelompok dari `ageDays` (`> 30` → `lebih_30_hari`, `≥ 8` → `hari_8_30`, selain itu `hari_0_7`) — setara persis dengan aturan ms Beranda (`now − oldest > 30×DAY_MS`), jadi angka hari, kelompok, dan butir `Kasbon > 30 hari` selalu sepakat. Server mengirim ringkasan `ages` (3 entri tetap, urutan PRD 0–7, 8–30, > 30) agar UI tidak menjumlah uang. Daftar = semua pelanggan urut saldo terbesar lalu nama; UI menyembunyikan saldo = 0 kecuali saat mencari. (jawaban pemilik Q8) Saldo < 0 (`Lebih bayar`): `age`/`ageDays`/`oldestUnpaidAt` null, tidak masuk `totalBalance` (= Σ saldo > 0), `debtorCount`, `ages`, `overdueCount`; tampil di daftar setelah yang berutang.
- **K7 Limit:** bilangan bulat ≥ 0; boleh di bawah saldo; limit bawaan pelanggan baru 500.000 (Pengaturan di F3c-2).
- **K8 Struk pelunasan:** dicetak server; isi = baris tabel Teks UI "struk pelunasan" (deskripsi kontrak); `print` dari klien (bawaan klien = `autoPrint`, R8); cetak ulang `/{id}/print`; dibatalkan → tombol nonaktif.
- **K9 Riwayat pelanggan** melipat pembalik ke barisnya: kasbon (struk & kasir) dan pelunasan (metode, jalur, pencatat, `inOpenShift`); yang dibatalkan membawa `{at, byName, reason, channel}` — batal kasbon karena batal transaksi memakai `voided*` penjualannya (ruling R4 menutup celah `byName = null`).
- **K10 HPP per baris:** `MockSale.lineCosts: (number | null)[]` sejajar `items`. `costTotal` tetap Σ dengan null = 0 (Beranda tidak berubah); laba **per barang** null bila ada baris tanpa HPP.
- **K11 Riwayat seed:** `HISTORY_DAYS = 63`, volume 20–60/hari (akhir pekan ×1,3), penjaga `JSON.stringify(createSeedState(NOW)).length < 4_000_000` (persist gagal diam-diam bila kuota localStorage lewat). 6 barang buatan "lambat". `catalogSince` = awal riwayat.
- **K12 Periode:** `hari`, `minggu` (Senin–Minggu), `bulan` (1–akhir), `tanggal` (maks. 92 hari). `to` > hari ini dijepit (`running: true`). Pembanding: hari → H−7; minggu → geser 7 hari; bulan **penuh** → bulan sebelumnya penuh; bulan **sebagian/berjalan** → tanggal sejajar dijepit ke akhir bulan sebelumnya; tanggal → rentang tepat sebelumnya sepanjang sama. Periode berjalan: hari terakhir pembanding dipotong sampai akhir menit sekarang **hanya bila hari itu sejajar dengan hari ini**; bila tanggal sejajar dijepit ke akhir bulan yang lebih pendek, hari terakhir pembanding dihitung penuh (jawaban pemilik Q7).
- **K13 Teks pembanding:** `Belum ada data {label}` bila pembanding tanpa penjualan selesai; persen hanya bila pembanding > 0; 0% → `Sama dengan`; pembanding ≤ 0 tetapi ada data → `{nilai pembanding} di {label}`†.
- **K14 Status sekarang:** laporan membaca status penjualan sekarang; `voidedCount` = penjualan yang dibuat di periode dan kini dibatalkan, per `kasirName` saat jual.
- **K15 Jumlah paling laku:** `qtyBase` per barang → `formatQty` satuan eceran; urut Jumlah = `qtyBase ÷ unitSize eceran`, seri → omzet lebih besar.
- **K16 Bentuk endpoint laporan:** `sales` (total, pembanding, seri, 3 teratas, kategori, kasir); `products` (`sort`) untuk `Lihat semua`; `stock`; `opname` dan `opname/{productId}`. Halaman utama = 3 query.
- **K17 Tidak terjual:** `ref = lastSoldAt ?? firstStockAt`, `firstStockAt = entri stok positif pertama ?? catalogSince`; `days = isoDaysBetween(jakartaIsoDate(ref), hari ini)`; tampil bila `days ≥ 30`; "baru" = `firstStockAt` < 30 hari; tidak ikut nonaktif/menunggu_harga/stok ≤ 0. `heldValue = unitCost(cost, stok)` atau null.
- **K18 Untung tipis:** `status = aktif` dengan HPP & harga eceran > 0; tipis bila `(price − unitCost) × 1000 < thinMarginPermille × price`; `marginPermille` bertanda dibulatkan; urut naik. `MockState.reportRules = { thinMarginPermille: 100, unsoldDays: 30 }`.
- **K19 Selisih opname laporan:** hitungan final = `cocok`, `disesuaikan`, `disetujui`, `dihitung_ulang` (memakai `recount.*`) dengan jam hitung di periode; `ditahan`, `menunggu_alasan`, `diganti` tidak ikut; `stok_awal` hanya patokan. Kartu kotor; null tidak dijumlah (`unknownValueCount`); Berulang = ≥ 2 hitungan kurang berurutan.
- **K20 Bertugas:** jeda = (hitungan final/`stok_awal` sebelumnya; hitungan ini]. Shift = `closedShifts` (+ `openedAt`) + shift buka yang tumpang; catatan = nota barang masuk aktif, `expiryLog` `keluar`, sesi opname lain. Digabung per nama, urut `localeCompare(…, "id")`.
- **K21 Grafik bersama:** `HealthChart` dua seri — belakang selebar slot, depan sempit (Beranda: belakang minggu lalu abu, depan hari ini hijau; Laporan: belakang omzet hijau, depan laba kotor `--color-chart-3`); laba negatif digambar 0, tabel & pembacaan memakai angka asli. Palet dicek validator dataviz.
- **K22 Ekspor:** **(pra-cek) dipindah ke F3c-2** bersama kontraknya.
- **K23 Anggaran:** bila `owner-` > 50 KB: Laporan ke chunk lazy `laporan-` (entri 30 KB) lewat `loadLaporan`, commit `chore(size): …`. Bila **total** > 270 KB (paling mungkin): ruling di ledger, naikkan `TOTAL_MAX` di commit tersendiri dengan angka terukur, lapor ke pemilik.
- **K24 Migrasi state (pra-cek):** v6 → **v7** di T2 (kasbon, laci, `closedShifts.openedAt`), v7 → **v8** di T2b (`shiftId` & `voided*` & `creditOverLimit` penjualan, `exceptionReviews`; `MockShift.saleRefunds` sudah ada sejak v7 — T2), v8 → **v9** di T8 (HPP per baris, riwayat 63 hari, `catalogSince`, `reportRules`); state tersimpan versi lama → seed baru (`isState` memeriksa versi persis + koleksi baru).
- **K25 Kasir (pra-cek):** tombol `Pelunasan kasbon` di `ShiftActions` sebelum `Riwayat`, **aktif walau keranjang berisi** (R7) — keranjang & `printReceipt` keranjang tidak disentuh; lembar = `Dialog` gaya jendela bayar; scan diabaikan selama terbuka (detektor sudah mengabaikan saat ada `role="dialog"`; dikunci tes). `CustomerPicker` mendapat prop `mode?: "kasbon" | "pelunasan"` (bawaan `"kasbon"` = perilaku & teks lama; `"pelunasan"`: `owing=true`, tanpa `Tambah pelanggan`, info `Sisa kasbon … · Limit …`). `Cetak struk` lokal di lembar, bawaan `settings.autoPrint` (R8). Setelah tersimpan lembar menampilkan hasil sampai `Tutup`.
- **K26 Laporan:** periode bawaan `Bulan` berjalan; state periode di search URL; `›` nonaktif bila periode berikutnya mulai setelah hari ini.
- **K27 Catat pelunasan pemilik:** cara bayar bawaan `Transfer`; `Lunas semua` mengisi sisa; tanpa struk.
- **K28 (ruling R1/R3/R4/R5) Kasir tanpa PIN:** `SaleRequest.ownerPin` → `creditLimitReason: string?` (1..200); kasbon melewati limit tanpa alasan → 409 `CREDIT_LIMIT` (lembar alasan, `saleId` sama), dengan alasan → tersimpan + `creditOverLimit = { excess, reason }`. `VoidRequest = { reason }`; kasir: sudah batal → 200; tanpa shift → 409 `SHIFT_CLOSED`; `sale.shiftId` = shift buka → koreksi `cashSales` seperti sekarang; (ruling R12, menggantikan `OUTSIDE_SHIFT` untuk transaksi) shift lain & `isoDaysBetween(jakartaIsoDate(createdAt), hari ini) ≤ 7` → stok kembali, kasbon −kredit, baris `saleRefunds { id, at, amount: bagian tunai, saleId }` di shift buka bila tunai > 0, `cashSales` shift lama tidak diubah; > 7 hari → 409 `VOID_TOO_OLD`. `Sale.shiftId` (wajib) ditambahkan (menutup carry-over Go "simpan shift_id di sales"). Dihapus: `PinRequired`, `UnauthorizedOrPinInvalid` (bila tak dipakai lagi), `PIN_REQUIRED`, `isOwnerPin`, `OwnerPinDialog` (+ tesnya). `ErrorCode` + `OUTSIDE_SHIFT` (kini hanya batal pelunasan kasir), `IN_OPEN_SHIFT`, `VOID_TOO_OLD` (ruling R12).
- **K29 (ruling R9) Pengecualian & tinjau:** jenis `batal_transaksi` (penjualan `voidChannel = kasir`; (ruling R12) `CashierException.fromClosedShift` = penjualan dari shift lain + `refund` = tunai keluar dari laci), `batal_pelunasan` (`cancelledChannel = kasir`), `kasbon_lewat_limit` (`creditOverLimit` ≠ null, penjualan tidak dibatalkan). Pembatalan oleh pemilik sendiri bukan pengecualian. `MockState.exceptionReviews: Record<ExceptionKind, number | null>`. Butir = semua kejadian dengan `at > reviewedAt` (tanpa batas umur); `from`/`to` = tanggal WIB tertua/terbaru. `POST …/review { kind, upTo }` → `reviewedAt = max(reviewedAt, min(upTo, now))` (idempoten, tidak mundur). Butir `Attention.exceptions` diurut tetap: batal_transaksi, batal_pelunasan, kasbon_lewat_limit.
- **K30 (ruling R4, jawaban pemilik Q1/Q2/Q8) Transaksi pemilik:** (Q8) kasbon yang sudah dicicil tetap boleh dibatalkan — saldo boleh minus, pelunasan tidak disentuh; daftar per tanggal (`date`, bawaan hari ini) + cari nomor struk (`q`), semua status; detail tanpa HPP; batal hanya bila shift penjualan sudah tutup: stok kembali, kasbon dibatalkan (entri −kredit `saleId`), `cashSales` shift tutup **tidak** diubah (aturan `applyVoid` lama), `voidChannel = pemilik`.

---

## Peta dependensi, model, dan gelombang (pra-cek)

```
T0 (mockup & spec; gerbang pemilik untuk layar baru) ─────────────┐
T1 ─> T2 ─┬─> T2b ─┬─> T5* ── (T4 lebih dulu)                      │
          │        └─> T7b* ── (T6 lebih dulu)                     │
          ├─> T3                                                   │
          ├─> T4* ─> T5*                                           │
          ├─> T6* ─> T7*                                           │
          └─> (T2b) ─> T8 ─> T9 ─┬─> T10 ──────┬─> T13* ─┐         │
                                 └─> T11* ─┬───┴─> T12* ─┴─> T15   │
* = memakai mockup yang disetujui di T0 ───────────────────────────┘
```

| Task | Implementer | Kode Opus | Re-review | Kode re-review | Gelombang |
|---|---|---|---|---|---|
| — Pra-cek rencana vs kode, termasuk label | **Opus** | — | — | — | 0 (selesai) |
| T0 Mockup final (ruling + layar baru: alasan kasir, tinjau pengecualian, transaksi pemilik); spec §12f | Sonnet | — | Tidak | — (tanpa kode; gerbang persetujuan pemilik) | 1 · ∥ T1 |
| T1 Kontrak kasbon, pelunasan, daftar per shift (J0), tutup shift (+ `saleRefunds` R12), `owing`, anggaran `problem-` | **Opus** | K-KONTRAK, K-UANG, K-SINKRON, K-AKSES | Ya | kode Opus | 1 · ∥ T0 |
| T2 Server palsu kasbon (v7, buku FIFO, saldo minus Q8, idempoten, batal per shift, umur) | **Opus** | K-KONTRAK, K-UANG, K-SINKRON, K-AKSES, K-BERSAMA (`credit-rules.ts`/`oldestUnpaidAt` dipakai Beranda & kasir) | Ya | kode Opus | 2 · sendiri |
| T2b Kasir tanpa PIN + void shift lama ≤ 7 hari (R1/R3/R4/R5/R9/R12, J0/Q8): kontrak, server palsu, jendela bayar & Riwayat | **Opus** | K-KONTRAK, K-UANG, K-STOK (void mengembalikan stok), K-AKSES (hapus PIN, allowlist `KasirLookupSale`), K-SINKRON, K-BERSAMA (`owner-summary`/pengecualian dipakai Beranda) | Ya | kode Opus + R-LAYAR, R-FOKUS (`ReasonDialog` + `useScanGuard`) | 3 · ∥ T3 |
| T3 Tutup shift: + pelunasan tunai − pengembalian transaksi lama (R12) | **Opus** | K-UANG (`handlers/shift.ts` expectedCash) | Ya | kode Opus + R-LAYAR (ringkasan tutup shift) | 3 · ∥ T2b |
| T4 Kasir: lembar `Pelunasan kasbon` (R7/R8, Q4/Q8) | Sonnet | — (UI: model pratinjau kembalian di fitur, server otoritatif di T2; pola kirim ulang `use-submit-sale` dipakai ulang) | Ya | R-UANG-UI (Tunai/QRIS, kembalian), R-FOKUS (scan diabaikan, Enter/Esc), R-LAYAR (`CustomerPicker` jendela bayar, header) | 4 · paralel |
| T5 Kasir: Riwayat shift ini — pelunasan, batal beralasan, cetak ulang, cari struk lama & batal dari laci shift ini (R2/R12) | Sonnet | — (UI; logika void & laci di T2b/T3) | Ya | R-UANG-UI, R-LAYAR (Riwayat), R-FOKUS (scan guard isian cari) | 5 · paralel |
| T6 Pemilik: tab Kasbon (Q8 `Lebih bayar`) | Sonnet | — | Ya | R-LAYAR (tes kerangka `owner-layout.test.tsx`) | 4 · paralel |
| T7 Pemilik: detail pelanggan (riwayat, limit, pelunasan langsung, batal; Q8) (R2) | Sonnet | — (UI; buku & idempoten di T2) | Ya | R-UANG-UI (Transfer / Tunai ke pemilik, batal) | 5 · paralel |
| T7b Pemilik: Perlu perhatian pengecualian, tinjau, Transaksi + batal (R4/R9/R12, Q1/Q2/Q8) | Sonnet | — (UI; mekanisme "sejak ditinjau" & void pemilik di T2b) | Ya | R-LAYAR (Beranda `attention-list`/`home-model`), R-UANG-UI (batal transaksi) | 5 · paralel |
| T8 Server palsu: HPP per baris + riwayat 63 hari (v9) | **Opus** | K-KONTRAK (migrasi v9), K-UANG (HPP), K-BERSAMA (data riwayat dipakai Beranda) | Ya | kode Opus | 4 · paralel |
| T9 Kontrak laporan + `report-period` (Q7) + server palsu laporan penjualan (+ `marginPermille` Q5) | **Opus** | K-KONTRAK, K-UANG (laba, aturan periode murni) | Ya | kode Opus | 5 · paralel |
| T10 Server palsu laporan stok, untung tipis, selisih opname + bertugas | **Opus** | K-STOK, K-UANG | Ya | kode Opus | 6 · paralel |
| T11 Laporan utama + `HealthChart` bersama Beranda (Q5/Q6) | **Opus** | K-BERSAMA (grafik Beranda jadi komponen bersama) | Ya | kode Opus + R-LAYAR (Beranda: tes & E2E grup grafik tanpa ubah asersi) | 6 · paralel |
| T12 Laporan: Paling laku, Per kategori, Per kasir | Sonnet | — | Tidak | — (rubrik: hanya menampilkan angka server; urutan `sort=omzet\|jumlah\|laba`, urutan kategori & kasir dari server T9; tes berangka persis) | 7 · paralel |
| T13 Laporan: Tidak terjual, Untung tipis, Selisih opname + detail | Sonnet | — | Tidak | — (rubrik: `marginPermille`, urutan untung tipis, urutan Tidak terjual `sort=modal\|lama`, total & bertugas semuanya dari server T9/T10; tes berangka persis) | 7 · paralel |
| ~~T14 Ekspor~~ → F3c-2 (Q3) | — | — | — | — | — |
| T15 E2E kasbon, pelunasan, kasir tanpa PIN, pengembalian keesokan hari (R12), laporan | Sonnet | — | Tidak | — (review biasa) | 8 · sendiri |
| — Review akhir seluruh cabang | **Opus** | — | — | — | 9 |
| — Fix wave | **Opus** | — | re-review temuan berisiko | — | 10 |

(label ulang pemilik, rubrik CLAUDE.md 5 Nov) T4, T5, T7, T7b turun ke Sonnet: tidak menulis handler server, aturan `shared/lib`, mesin sinkron, atau kontrak — logika uangnya ada di T2/T2b/T3. T12/T13 tanpa re-review (rubrik 5 Nov: hanya menampilkan angka server). Syarat: urutan & persen dihitung server (T9/T10); implementer yang ternyata perlu menghitung, mengurutkan, atau memfilter angka uang di komponen harus berhenti dan lapor — task itu lalu mendapat R-UANG-UI + re-review. Review akhir Opus memberi perhatian ekstra ke T4, T5, T7, T7b, T12, T13.

Jumlah: 15 task implementasi (T1–T13 termasuk T2b & T7b) + T0 dokumen + T15 E2E = 17 baris; F3c-2 menerima Ekspor (eks-T14, jawaban pemilik Q3), R10, R11. (ruling R12) tidak menambah task: kontrak + server di T2b (Opus), tutup shift di T3 (Opus), layar kasir di T5 (Sonnet + re-review); R12 sudah lewat cek ulang terpisah (cek ulang 2).

Gerbang (pra-cek): mockup Kasbon, lembar pelunasan, dan Laporan sudah ada — T0 hanya menerapkan ruling & menunggu persetujuan versi final. Layar **baru** (dialog alasan kasir, halaman tinjau, Transaksi pemilik) menunggu persetujuan T0 sebelum T2b (bagian UI) dan T7b dimulai.

File bersama (berurutan): `api/openapi.yaml` + gen + `contract.test.ts` + `openapi-text.test.ts` T1 → T2b → T9; `mocks/db.ts`, `mocks/history.ts`, `mocks/seed-data.ts`, `mocks/handlers/sales.ts`, `mocks/sale-rules.ts` T2 → T2b → T8; `mocks/handlers/shift.ts` T2 → T3 (T2b tidak menyentuhnya); `mocks/handlers/index.ts` T2 → T2b → T9; `mocks/owner-summary.ts` T2b saja; `features/kasir/history/history-sheet.tsx` T2b → T5; (ruling R12) `MockShift.saleRefunds`: tipe & inisialisasi T2 (`db.ts`, `handlers/shift.ts`), ditulis T2b (`handlers/sales.ts`), dijumlah T3 (`handlers/shift.ts`) — T2b & T3 paralel tanpa file sama; `features/kasir/shift/shift-actions.tsx` hanya T4; `features/kasir/payment/customer-picker.tsx` hanya T4 (T2b tidak menyentuhnya); `app/owner-routes.tsx` + `features/owner/index.ts` + `features/owner/common/sub-page-header.tsx` T6 → T7b → T11; `features/owner/pages.tsx` T6 → T11; `features/owner/home/home-model.ts` + `attention-list.tsx` T7b → T11 (T11 hanya membaca `hourWindow`); `docs/specs/2026-10-17-frontend-design.html` T0 → T2b → T4; gel. 7: T12 dan T13 masing-masing hanya mengisi file placeholder miliknya (dibuat T11) — tanpa file bersama.

---

### Task 0: Mockup final & spec §12f (pra-cek, ruling R1–R9)

**Model:** Sonnet · **Gelombang:** 1 (paralel dengan T1) · **Risk class:** dokumen, gerbang pemilik

**Files:** Create (draf) `.superpowers/brainstorm/1747-1793890982/content/kasbon-v2.html`, `pelunasan-kasir-v2.html`, `laporan-v4.html`, `pengecualian-v1.html`; setelah disetujui Create `docs/specs/assets/2026-11-05-kasbon.html`, `2026-11-05-pelunasan-kasir.html`, `2026-11-05-laporan.html`, `2026-11-05-pengecualian.html`; Modify `docs/specs/2026-10-17-frontend-design.html` (§12f baru + butir daftar isi).

**Interfaces — Consumes:** mockup v1/v3 yang ada (salin, jangan gambar ulang), `_kerangka-pemilik.html`, daftar periksa 1–16, tabel Teks UI, `features/kasir/payment/payment-dialog.tsx` + `history/history-sheet.tsx`. **Produces:** empat mockup bertanda "angka contoh"; §12f.

- [ ] **Step 1: Kasbon v2** dari v1: catatan `Atur limit` → teks R7; ringkasan umur & `Dibatalkan` dengan alasan + pembatal (R2); lembar batal pelunasan pemilik (dengan alasan; varian "masih di shift buka"); hapus semua kata "tebakan" (R7 menyetujui).
- [ ] **Step 2: Pelunasan kasir v2** dari v1: `Cetak struk` ikut `autoPrint` (R8); konfirmasi batal dengan isian `Alasan` menggantikan "Lanjut ke PIN pemilik"; hasil `Pelunasan tersimpan`; ringkasan tutup shift dengan `Pelunasan kasbon` di atas `Bayar supplier`; **baru (ruling R3/R4/R12, jawaban pemilik J0/Q4):** judul `Riwayat shift ini`, dialog `Batalkan {nomor}?` beralasan, bagian `Transaksi shift sebelumnya` + `Cari nomor struk` dan dialognya (bagian tunai/QRIS/kasbon), baris tutup shift `Pengembalian transaksi lama`, QRIS pelunasan satu tombol `Sudah masuk`, dialog `Kasbon melewati limit` beralasan.
- [ ] **Step 3: Laporan v4** dari v3: keempat kartu punya baris pembanding (P6) dan label `Laba kotor · 16,4%` (jawaban pemilik Q5), `dari harga eceran` (P10), detail selisih urut nama + kotak bertugas K20, tanpa `cek acak` (pengaman 5 = F3c-2), **tanpa bagian Ekspor** (F3c-2); layar baru Hari (per jam), `Pilih tanggal`, Per kategori, Untung tipis, kosong selisih.
- [ ] **Step 4: Pengecualian v1 (ruling R4/R9)** dari kerangka: Beranda dengan tiga butir Perlu perhatian baru (rentang tanggal), halaman tinjau, Lainnya > `Transaksi` (daftar per hari + cari), detail transaksi dengan `Batalkan transaksi` beralasan dan varian "masih di shift buka".
- [ ] **Step 5: Cocokkan** setiap layar pemilik dengan daftar periksa 1–16 dan Beranda/Barang; laporan agent menyebut butir lolos & yang sengaja menyimpang (CLAUDE.md). Teks hanya dari tabel Teks UI (usulan baru ditandai).
- [ ] **Step 6: Gerbang pemilik** — controller menunjukkan mockup + daftar periksa (pertanyaan rencana sudah dijawab); perubahan masuk mockup **dan** tabel Teks UI sebelum T2b-UI/T4/T6/T7b/T11 dimulai.
- [ ] **Step 7:** salin versi disetujui ke `docs/specs/assets/2026-11-05-*.html`; tulis §12f "Kasbon, pelunasan, kasir tanpa PIN, dan Laporan (F3c-1, disetujui {tanggal})": tabel Topik | Keputusan berisi P1–P20 (yang masih berlaku), **R1–R9**, K2, K5, K6, K12, K13, K17–K20, K28–K30, tautan mockup, dan catatan "§9: riwayat contoh kini 63 hari".
- [ ] **Step 8:** commit `docs: mockup dan spec §12f F3c-1 — kasbon, pelunasan, kasir tanpa PIN, laporan`.

---

### Task 1: Kontrak kasbon, pelunasan, dan tutup shift (pra-cek)

**Model:** Opus · **Gelombang:** 1 · **Risk class:** risky (kontrak, uang, akses kasir)

**Files:** Modify `api/openapi.yaml`; regenerate `web/src/shared/api/gen/**`; Modify `web/src/shared/api/contract.test.ts`, `web/src/shared/api/openapi-text.test.ts`, fixture `ShiftClosure` di `web/src/features/kasir/shift/close-shift-dialog.test.tsx`, `web/src/mocks/handlers/shift.ts` & `web/src/mocks/history.ts` (isi sementara `creditPayments: 0`, `saleRefunds: 0` — ruling R12), (cek ulang 2) fixture `closedShifts` di `web/src/mocks/owner-summary.test.ts` (tambah dua field saja; T2 menambah `openedAt` di fixture yang sama), `web/scripts/check-bundle-size.mjs` (entri `{ label: "problem", prefix: "problem-", max: 30 * KB }`).

**Interfaces — Produces.** Kasir: tag `credit`, `cookieAuth`, `401`. Pemilik: tag `owner`, `ownerCookieAuth`, `401`.

| Method & path | operationId | Body | Sukses | Error |
|---|---|---|---|---|
| `GET /api/customers` (+ `owing` boolean opsional) | `searchCustomers` (ada) | — | 200 `Customer[]` | |
| `POST /api/credit-payments` | `createCreditPayment` | `KasirCreditPaymentInput` | 201 / 200 replay `KasirCreditPayment` | 404, 409 `ShiftClosed` \| `IdTaken`, 422 |
| `GET /api/credit-payments/shift` (jawaban pemilik J0) | `listShiftCreditPayments` | — | 200 `KasirCreditPayment[]` (shift yang sedang buka, terbaru dulu; tanpa shift `[]`) | |
| `POST /api/credit-payments/{paymentId}/print` | `printCreditPayment` | — | 200 `PrintResult` | 404 |
| `POST /api/credit-payments/{paymentId}/cancel` | `cancelCreditPayment` | `CancelCreditPaymentInput` | 200 `KasirCreditPayment` | 404, 409 `SHIFT_CLOSED` \| `OUTSIDE_SHIFT`, 422 |
| `GET /api/owner/customers` | `listOwnerCustomers` | — | 200 `OwnerCustomerList` | |
| `GET /api/owner/customers/{customerId}` | `getOwnerCustomer` | — | 200 `OwnerCustomer` | 404 |
| `PUT /api/owner/customers/{customerId}/credit-limit` | `setOwnerCustomerCreditLimit` | `CreditLimitInput` | 200 `OwnerCustomer` | 404, 422 |
| `POST /api/owner/customers/{customerId}/payments` | `createOwnerCreditPayment` | `OwnerCreditPaymentInput` | 201 / 200 replay `OwnerCustomer` | 404, 409 `IdTaken`, 422 |
| `POST /api/owner/credit-payments/{paymentId}/cancel` | `cancelOwnerCreditPayment` | `CancelCreditPaymentInput` | 200 `OwnerCustomer` | 404, 409 `IN_OPEN_SHIFT`, 422 |

Skema (semua `required` = semua properti; `?` = nullable, pola `nullable: true` + `allOf` untuk `$ref`):
```yaml
ErrorCode: + OUTSIDE_SHIFT, IN_OPEN_SHIFT          # (pra-cek) dipakai juga T2b
CreditPaymentMethod: enum [tunai, qris, transfer, titip]
CreditPaymentChannel: enum [kasir, pemilik]
CreditAge: enum [hari_0_7, hari_8_30, lebih_30_hari]
KasirCreditPaymentInput: { id: string 1..64, customerId, amount: int ≥1, method: enum[tunai, qris], cashReceived: int?, print: bool }
KasirCreditPayment: { id, customerId, customerName, amount, method: enum[tunai, qris], cashReceived: int, change: int,
  balanceAfter: int, createdAt: int64, kasirName, shiftId: string, status: enum[aktif, dibatalkan], printStatus: PrintStatus }
CancelCreditPaymentInput: { reason: string 1..200 }                    # (ruling R2) tanpa ownerPin
OwnerCreditPaymentInput: { id: string 1..64, amount: int ≥1, method: enum[transfer, titip] }
CreditLimitInput: { creditLimit: int ≥0 }
OwnerCustomerRow: { id, name, phone, balance, creditLimit, oldestUnpaidAt: int64?, ageDays: int?, age: CreditAge? }   # age/ageDays null iff balance ≤ 0 (K6)
CreditAgeSummary: { age: CreditAge, count: int, total: int }
OwnerCustomerList: { customers: OwnerCustomerRow[], totalBalance: int, debtorCount: int, ages: CreditAgeSummary[] (tepat 3, urut 0–7, 8–30, >30), overdueCount: int }
CreditPaymentInfo: { id, channel: CreditPaymentChannel, method: CreditPaymentMethod, byName, cashReceived: int, change: int, inOpenShift: bool }
CreditCancel: { at: int64, byName: string, reason: string, channel: CreditPaymentChannel }
CreditHistoryEntry: { id, at: int64, kind: enum[kasbon, pelunasan], amount: int ≥1, saleId: string?, saleNumber: string?,
  kasirName: string?, payment: CreditPaymentInfo?, cancelled: CreditCancel? }        # terbaru dulu (K9)
OwnerCustomer: allOf OwnerCustomerRow + { history: CreditHistoryEntry[] }           # (pra-cek) drawerShift dihapus: pemilik tidak pernah mengoreksi laci
ShiftClosure: + creditPayments: int   # Σ pelunasan tunai jalur kasir di shift ini
              + saleRefunds: int      # (ruling R12) Σ tunai transaksi shift lama yang dibatalkan kasir di shift ini; expectedCash = openingCash + cashSales − supplierPayments + creditPayments − saleRefunds
              # (cek ulang 2) deskripsi `supplierPayments` yang ada memuat rumus lama "expectedCash = openingCash + cashSales − supplierPayments" → ganti ke rumus lengkap yang sama (satu rumus di kontrak)
```
Deskripsi kontrak memuat: K2, K3, K4, K5 (pembagian kasir/pemilik), K8 (isi struk), `owing`, "uang pemilik (transfer/tunai ke pemilik) tidak pernah masuk laci", "pembatalan dari app pemilik tidak pernah mengoreksi laci", "HPP & laba tidak pernah di respons kasir", aturan umur K6, FIFO (R6).

- [ ] **Step 1: Tulis test kontrak yang gagal** — `contract.test.ts`: kesembilan operationId baru ada di `gen/credit/credit` atau `gen/owner/owner`; `CreateCreditPaymentBody` menolak `amount: 0`, `id` 65 karakter, `method: "transfer"`, menerima Tunai & QRIS `cashReceived: null`; `CreateOwnerCreditPaymentBody` menolak `tunai`/`qris`, menerima `titip`; `SetOwnerCustomerCreditLimitBody` menolak `-1`, menerima `0`; `CancelCreditPaymentBody` menolak `reason: ""` dan tidak punya `ownerPin`; `SearchCustomersParams` menerima `owing: true`; **allowlist** (pra-cek — tidak ada "walker" di contract.test; pakai pola `expectTypeOf<keyof …>()` yang ada): `keyof KasirCreditPayment` persis daftar di atas; `ShiftClosure` memuat `creditPayments` dan `saleRefunds`. `openapi-text.test.ts`: deskripsi `createCreditPayment` memuat `tidak pernah masuk laci`, `maksimal sisa kasbon`, `id yang sama`; `cancelCreditPayment` memuat `shift yang sedang buka`; `cancelOwnerCreditPayment` memuat `laci tidak dikoreksi`; `ShiftClosure.saleRefunds` memuat rumus `expectedCash` lengkap; `OwnerCustomerRow.ageDays` memuat `pembulatan ke atas`.
- [ ] **Step 2:** `npx vitest run src/shared` → FAIL.
- [ ] **Step 3:** ubah `openapi.yaml`, `npm run gen`, isi sementara `creditPayments: 0` & `saleRefunds: 0`, fixture test kasir (penambahan field saja); entri `problem-` 30 KB.
- [ ] **Step 4:** semua pemeriksaan wajib hijau (tes lama tanpa perubahan asersi).
- [ ] **Step 5:** commit `feat(api): kontrak kasbon pemilik, pelunasan kasir, dan pelunasan di tutup shift` + `chore(size): anggaran sendiri untuk chunk problem (30 KB)`.

---

### Task 2: Server palsu kasbon — state v7, buku FIFO, idempoten, batal per shift, umur (pra-cek, ruling R2/R6)

**Model:** Opus · **Gelombang:** 2 (sendiri) · **Risk class:** risky (uang, ledger, idempoten)

**Files:** Modify `web/src/mocks/db.ts` (+ `db.test.ts`), `web/src/mocks/seed-data.ts` (+ test, v7), `web/src/mocks/seed-customers.ts`, `web/src/mocks/history.ts` (+ `history.test.ts`; pelunasan Mbak Dewi jadi rekaman, `closeShifts` mengisi `openedAt` = 06.00 / 13.00), `web/src/mocks/ledger.ts` (+ `ledger.test.ts`), `web/src/mocks/handlers/shift.ts` (shift baru `creditCash: []`, `saleRefunds: []` (ruling R12, diisi T2b, dijumlah T3); tutup shift menyimpan `openedAt`), `web/src/mocks/handlers/sales.ts` (`appendCredit` + `paymentId: null`), `web/src/mocks/handlers/customers.ts` (+ `customers.test.ts`, `owing`), `web/src/mocks/handlers/index.ts`, `web/src/mocks/handlers/test-helpers.ts` (+ `FORBIDDEN_KASIR_KEYS`); Create `web/src/shared/lib/credit-rules.ts` (+ test), `web/src/mocks/credit/payments.ts` (+ test), `web/src/mocks/credit/views.ts`, `web/src/mocks/handlers/credit-payments.ts` (+ test), `web/src/mocks/handlers/owner-customers.ts` (+ test).

**Interfaces — Consumes:** gen T1; `appendCredit`, `oldestUnpaidAt`, `balanceOf`, `requireSession`, `requireOwnerSession`, `problem`, `invalid`, `readJson`, `withScenario`, `getScenario`. **Produces:**
```ts
// db.ts — version: 7 (isState memeriksa creditPayments)
export type CreditEntry = { id: string; customerId: string; amount: number; at: number; saleId: string | null; paymentId: string | null };
export type MockCreditPayment = { id: string; customerId: string; amount: number; at: number;
  channel: CreditPaymentChannel; method: CreditPaymentMethod; createdById: string; createdByName: string;
  shiftId: string | null; cashReceived: number; change: number; balanceAfter: number; printStatus: PrintStatus;
  cancelledAt: number | null; cancelledById: string | null; cancelledByName: string | null;
  cancelledChannel: CreditPaymentChannel | null; cancelReason: string | null };
export type MockCreditCash = { id: string; at: number; amount: number; paymentId: string; kind: "pelunasan" | "batal_pelunasan" };
// MockShift: + creditCash: MockCreditCash[]; + saleRefunds: MockSaleRefund[] (ruling R12)   MockState: + creditPayments: MockCreditPayment[]
export type MockSaleRefund = { id: string; at: number; amount: number; saleId: string };   // tunai keluar laci, > 0
export type MockClosedShift = ShiftClosure & { kasirName: string; openedAt: number; closedAt: number };
// shared/lib/credit-rules.ts
export const CREDIT_METHOD_LABEL: Record<CreditPaymentMethod, string>;      // Tunai, QRIS, Transfer, Tunai ke pemilik
export function creditAgeDays(oldestUnpaidAt: number | null, now: number): number | null;   // ceil (K6)
export function creditAge(ageDays: number | null): CreditAge | null;
export function repaymentProblem(amount: number | null, balance: number): string | null;   // urutan: saldo ≤ 0, < 1, > saldo
// mocks/credit/payments.ts
export function recordPayment(state: MockState, user: MockUser, channel: CreditPaymentChannel,
  customerId: string, input: unknown, now: number): { status: 200 | 201; payment: MockCreditPayment } | Response;
export function cancelPayment(state: MockState, paymentId: string, by: { user: MockUser; channel: CreditPaymentChannel },
  input: unknown, now: number): MockCreditPayment | Response;        // K5; idempoten
export const creditPaymentsOf = (shift: MockShift): number;          // Σ creditCash.amount
// mocks/credit/views.ts
export function toKasirPayment(state: Readonly<MockState>, p: MockCreditPayment): KasirCreditPayment;  // allowlist T1
export function ownerCustomerList(state: Readonly<MockState>, now: number): OwnerCustomerList;
export function ownerCustomer(state: Readonly<MockState>, customerId: string, now: number): OwnerCustomer | null;
```
`oldestUnpaidAt`: entri positif ber-`paymentId` adalah pembalik — mengurangi jumlah yang sudah dibayar, bukan kasbon baru. `recordPayment` berurutan: bentuk & `id` → 422; `id` milik pembuat lain → 409 `ID_TAKEN`; milik sendiri → 200 apa adanya (sebelum cek shift/saldo); pelanggan tidak ada → 404; kasir tanpa shift → 409 `SHIFT_CLOSED`; metode di luar jalur → 422 `Cara bayar tidak valid`; `repaymentProblem` → 422; Tunai uang kurang → 422 `Uang diterima kurang dari jumlah bayar`; QRIS dengan `cashReceived` ≠ null → 422; lalu `appendCredit(−amount, paymentId)`, rekaman (`shiftId` = shift buka untuk kasir), dan (kasir + tunai) `creditCash +amount`. `printStatus`: `print` true → skenario `printer-gagal` ? `gagal` : `tercetak`; selain itu / jalur pemilik `tidak_dicetak`. Pesan `repaymentProblem`: `Pelanggan ini tidak punya kasbon`, `Jumlah minimal Rp1`, `Melebihi sisa kasbon {Rp}` (pra-cek: tanpa kurung, sesuai mockup). **(pra-cek) Seed:** rekaman pelunasan seed (Mbak Dewi, Bu Tini) = `channel: kasir, method: tunai, shiftId: null, createdByName: "Rina"` dan **tidak** dihitung di `closedShifts` (penyederhanaan seed); penjaga `history.test`: setiap `closedShifts` memenuhi `expectedCash === openingCash + cashSales − supplierPayments + creditPayments − saleRefunds`. **(cek ulang) Kasbon yang dibatalkan karena batal jual** (entri −kredit ber-`saleId`): di T2 `cancelled` diisi sementara `{ at: sale.voidedAt, byName: "", reason: "", channel: "kasir" }` karena `voided*` baru ada di T2b; T2b menggantinya dengan `voidedByName`/`voidReason`/`voidChannel` (file `credit/views.ts` + `owner-customers.test.ts` ada di daftar T2b).

- [ ] **Step 1: Tulis test yang gagal**
```ts
// credit-rules.test.ts
test.each([[null, null], [NOW, 0], [NOW - 1, 1], [NOW - 7 * DAY_MS, 7], [NOW - 7 * DAY_MS - 1, 8],
  [NOW - 30 * DAY_MS, 30], [NOW - 30 * DAY_MS - 1, 31]])("creditAgeDays(%s) = %s", (at, d) => expect(creditAgeDays(at, NOW)).toBe(d));
test.each([[null, null], [7, "hari_0_7"], [8, "hari_8_30"], [30, "hari_8_30"], [31, "lebih_30_hari"]])("creditAge(%s)", (d, a) =>
  expect(creditAge(d)).toBe(a));
test("kelompok sepakat dengan Beranda: lebih_30_hari ⇔ now − oldest > 30×DAY_MS", …);   // sampel di sekitar batas
test("repaymentProblem: saldo 0, nol, lebih, pas", () => {
  expect(repaymentProblem(50_000, 0)).toBe("Pelanggan ini tidak punya kasbon");
  expect(repaymentProblem(0, 120_000)).toBe("Jumlah minimal Rp1");
  expect(repaymentProblem(120_001, 120_000)).toBe("Melebihi sisa kasbon Rp120.000");
  expect(repaymentProblem(120_000, 120_000)).toBeNull();
});
// ledger.test.ts — Bu Tini: 70h +300k, 45h +500k, 38h −300k, 9h +140k → tertua 45 hari
test("cicilan FIFO (R6): pelunasan 500k hari ini → tertua 9 hari", …);
test("batal pelunasan mengembalikan umur lama, bukan kasbon baru (pembalik +500k p1 → tertua 45 hari)", …);
// (jawaban pemilik Q8) kasbon jual 100k (saleId s1), pelunasan 60k, batal jual (−100k s1) → saldo −60k, oldestUnpaidAt null;
//   kasbon baru 50k → saldo −10k, null; kasbon baru 80k lagi → saldo 70k, tertua = jam kasbon 80k (lebih bayar terpotong dulu)
test("saldo minus (lebih bayar) & kasbon berikutnya memotong lebih bayar dulu", …);
// customers.test.ts — owing=true hanya saldo > 0 (Mbak Dewi tidak ikut), urutan nama tetap; tanpa owing perilaku lama
// credit-payments.test.ts (MSW, Rina buka shift modal 200.000; Bu Sari saldo 120.000)
test("Tunai 50.000 diterima 100.000 → 201, kembalian 50.000, sisa 70.000, buku −50.000, laci +50.000, shiftId = shift Rina", …);
test("kirim ulang id sama (isi beda 60.000) → 200 rekaman asli; buku & laci tidak dobel; replay setelah shift ditutup tetap 200", …);
test("QRIS 20.000 → tanpa baris laci; shiftId terisi", …);
test.each([[0, "Jumlah minimal Rp1"], [120_001, "Melebihi sisa kasbon Rp120.000"]])("jumlah %i → 422 %s", …);
test("Tunai diterima 40.000 untuk 50.000 → 422; QRIS + cashReceived → 422", …);
test("tanpa shift → 409 SHIFT_CLOSED; tanpa sesi → 401; pelanggan tidak ada → 404; id milik Rina dikirim Budi → 409 ID_TAKEN", …);
test("respons kasir tanpa key terlarang (FORBIDDEN_KASIR_KEYS + channel, cancelReason, createdById)", …);
test("batal kasir: reason kosong → 422; benar → dibatalkan, buku +50.000, laci −50.000 batal_pelunasan, cancelledByName Rina, cancelledChannel kasir, cancelReason tersimpan; batal ulang 200 tanpa baris baru", …);
test("batal kasir untuk pelunasan shift A setelah A ditutup & B (Budi) buka → 409 OUTSIDE_SHIFT, tanpa perubahan", …);
test("batal kasir tanpa shift buka → 409 SHIFT_CLOSED; (jawaban pemilik J0) listShiftCreditPayments = pelunasan shift yang sedang buka terbaru dulu (shift Budi tidak memuat pelunasan shift Rina walau hari sama; shift lewat tengah malam tetap memuat pelunasan 23.50); tanpa shift → []", …);
test("cetak ulang → printStatus tercetak; skenario printer-gagal → gagal", …);
// owner-customers.test.ts
test("daftar: semua pelanggan urut saldo desc lalu nama; ages 3 entri (0–7, 8–30, >30) dengan count & total; overdueCount = attention.overdueCredit.count; ageDays Bu Tini 45", …);
test("(jawaban pemilik Q8) pelanggan saldo −60.000: age/ageDays/oldestUnpaidAt null, tidak masuk totalBalance, debtorCount, ages, overdueCount; tetap ada di customers", …);
test("detail Bu Tini: riwayat terbaru dulu, kasbon seed tanpa struk, pelunasan seed Tunai jalur kasir", …);
test("Transfer 100.000 saat shift buka → tanpa baris laci, channel pemilik; tunai → 422 Cara bayar tidak valid; replay 200", …);
test("batal pemilik: pelunasan kasir di shift yang masih buka → 409 IN_OPEN_SHIFT; setelah shift ditutup → dibatalkan, TANPA baris laci di shift mana pun, cancelledChannel pemilik", …);
test("batal pemilik pelunasan Transfer → buku +jumlah; reason kosong → 422", …);
test("limit −1 → 422 Limit harus bilangan bulat minimal 0; 0 → tersimpan; di bawah saldo boleh", …);
// db.test.ts — state v6 tersimpan → seed v7; seed-data.test: setiap entri negatif seed punya rekaman pelunasan (paymentId)
// history.test.ts — closedShifts: openedAt Rina 06.00, Budi 13.00, < closedAt; creditPayments 0, saleRefunds 0; invarian expectedCash
// auth-shift.test.ts — tutup shift menyimpan openedAt = shift.openedAt di closedShifts
```
- [ ] **Step 2:** `npx vitest run src/mocks src/shared/lib/credit-rules.test.ts` → FAIL.
- [ ] **Step 3:** implementasi + daftarkan handler. Penjualan & batal jual memakai `paymentId: null`; `owner-summary.test.ts` (overdueCredit Bu Sari, Pak Udin, Bu Tini) tetap hijau tanpa perubahan asersi ((cek ulang 2) fixture `closedShifts` hanya ditambah `openedAt`).
- [ ] **Step 4:** seluruh `npx vitest run src/mocks` PASS + pemeriksaan wajib.
- [ ] **Step 5:** commit `feat(mock): state v7 — pelunasan kasbon dua jalur, batal per shift, dan umur kasbon`.

---

### Task 2b: Kasir tanpa PIN pemilik — kontrak, server palsu, jendela bayar & Riwayat (ruling R1/R3/R4/R5/R9/R12, jawaban pemilik J0/Q8)

**Model:** Opus · **Gelombang:** 3 (paralel dengan T3) · **Risk class:** risky (kontrak, uang, akses, layar kasir jadi)

**Files:** Modify `api/openapi.yaml`; regenerate gen; Modify `web/src/shared/api/contract.test.ts`, `openapi-text.test.ts`, `web/src/shared/api/problem.ts` (bila perlu), `web/src/shared/lib/error-messages.ts` (+ test: hapus `PIN_REQUIRED`, tambah `OUTSIDE_SHIFT` `Pelunasan dari shift sebelumnya — batalkan dari app pemilik`† (ruling R12: kini hanya pelunasan), `IN_OPEN_SHIFT` `Masih di shift yang buka — batalkan dari kasir`†, `VOID_TOO_OLD` `Transaksi lebih dari 7 hari — batalkan dari app pemilik`†); `web/src/mocks/db.ts` (+ test, **v8**), `web/src/mocks/seed-data.ts` (+ test), `web/src/mocks/history.ts` (+ test: id shift dibuat sebelum penjualan hari itu, `shiftId` tiap penjualan riwayat = shift penutupnya), `web/src/mocks/sale-rules.ts` (+ test; `creditGate` → alasan, hapus `isOwnerPin`), `web/src/mocks/handlers/sales.ts` (+ `sales.test.ts`, `sales-ledger.test.ts`; boleh pecah ke `handlers/sales-void.ts` — file sudah 288 baris), `web/src/mocks/owner-summary.ts` (+ test), `web/src/mocks/handlers/index.ts`, **(cek ulang)** `web/src/mocks/credit/views.ts` (+ `handlers/owner-customers.test.ts`: kasbon batal-jual membawa `cancelled` dari `voided*`), fixture `MockSale`/`Attention` yang hanya ditambah field wajib di `mocks/stock/opname.test.ts`, `mocks/stock/stock-at.test.ts`, `mocks/owner-summary.test.ts`, `features/owner/home/home-model.test.ts` (`exceptions: []`), dan body `voidSale` tanpa `ownerPin` di `mocks/handlers/owner-products.test.ts` (asersi mutasi `batal` tetap); Create `web/src/mocks/exceptions.ts` (+ test), `web/src/mocks/handlers/owner-sales.ts` (+ test), `web/src/mocks/handlers/owner-exceptions.ts` (+ test); kasir: Modify `web/src/features/kasir/payment/{use-submit-sale.ts, payment-model.ts (+ test), sale-prompts.tsx, kasbon-tab.tsx, payment-dialog.test.tsx}`, `web/src/features/kasir/history/history-sheet.tsx` (+ test); Create `web/src/features/kasir/common/reason-dialog.tsx` (+ test); Delete `web/src/features/kasir/common/owner-pin-dialog.tsx` + `owner-pin-dialog.test.tsx`; Modify fixture `Sale` di tes kasir (tambah `shiftId`); (jawaban pemilik J0) `web/src/features/kasir/shift/kasir-gate.test.tsx` (teks kosong Riwayat) dan `features/kasir/payment/payment-dialog.test.tsx` "penjualan berhasil → riwayat … ditandai basi" (query key `getListShiftSalesQueryKey`); (ruling R12) penulisan `MockShift.saleRefunds` di jalur void (tanpa menyentuh `handlers/shift.ts`); `web/e2e/kasir-flows.spec.ts` (skenario PIN → alasan; dijalankan controller); `docs/specs/2026-10-17-frontend-design.html` §12c (+ §4, §5 — cek ulang), `docs/PRD.html`, `docs/specs/2026-10-17-arsitektur-kasir-design.html` (cek ulang; lihat Step 4).

**Interfaces — Produces (kontrak):**
```yaml
SaleRequest: − ownerPin; + creditLimitReason: string? (1..200)       # tanpa alasan & melewati limit → 409 CREDIT_LIMIT; dengan alasan → tersimpan
VoidRequest: { reason: string 1..200 }                               # − ownerPin
Sale: + shiftId: string                                              # kasir & pemilik
createSale/voidSale 401: Unauthorized (bukan UnauthorizedOrPinInvalid); voidSale: 409 SHIFT_CLOSED | VOID_TOO_OLD (ruling R12); tanpa 403
GET /api/sales/shift  listShiftSales   200 Sale[]  # (jawaban pemilik J0) menggantikan GET /api/sales/today + listTodaySales: penjualan shift yang sedang buka, terbaru dulu; tanpa shift → []
GET /api/sales/lookup?q=  lookupSales  200 KasirLookupSale[] # (ruling R12) penjualan shift LAIN (bukan shift buka) dengan hari kalender WIB ≤ 7 hari lalu, nomor memuat q (q 1..20, digit/-), terbaru dulu, maks 20; 422 q kosong; butuh sesi kasir & shift buka (409 SHIFT_CLOSED)
KasirLookupSale: allOf Sale + { customerName: string? }   # (cek ulang 2) dialog T5 `Kasbon {nama} dikurangi {Rp}.` butuh nama; `Sale` hanya punya customerId & kasir tidak punya GET pelanggan per id. Allowlist kasir + `customerName`.
ExceptionKind: enum [batal_transaksi, batal_pelunasan, kasbon_lewat_limit]
CashierException: { id, kind: ExceptionKind, at: int64, kasirName, amount: int, reason, customerName: string?, saleId: string?, saleNumber: string?, paymentId: string?,
  fromClosedShift: bool, refund: int }   # amount: total transaksi / nominal pelunasan / kelebihan limit; (ruling R12) fromClosedShift + refund = tunai keluar laci shift buka (0 bila bukan)
ExceptionAttention: { kind: ExceptionKind, count: int, total: int, from: date, to: date }
Attention: + exceptions: ExceptionAttention[]                       # hanya jenis dengan count > 0, urutan K29
OwnerExceptionList: { kind, reviewedAt: int64?, items: CashierException[] }   # terbaru dulu, hanya at > reviewedAt
ExceptionReviewInput: { kind: ExceptionKind, upTo: int64 }
SaleVoid: { at: int64, byId: string, byName: string, reason: string, channel: enum[kasir, pemilik] }   # (cek ulang) byId: syarat pemilik "siapa (id + nama)" tampil di detail pemilik
OwnerSaleRow: { id, number, createdAt: int64, kasirName, total, methodLabel: string, status: SaleStatus, shiftOpen: bool }
OwnerSale: allOf Sale + { customerName: string?, shiftOpen: bool, voided: SaleVoid?, creditOverLimit: { excess: int, reason: string }? }
GET  /api/owner/sales?date=YYYY-MM-DD&q=   listOwnerSales      200 OwnerSaleRow[] (terbaru dulu), 422 tanggal
GET  /api/owner/sales/{saleId}             getOwnerSale        200 OwnerSale, 404
POST /api/owner/sales/{saleId}/void        voidOwnerSale       body VoidRequest → 200 OwnerSale, 404, 409 IN_OPEN_SHIFT, 422
GET  /api/owner/exceptions?kind=           listOwnerExceptions 200 OwnerExceptionList, 422
POST /api/owner/exceptions/review          reviewOwnerExceptions body ExceptionReviewInput → 200 OwnerExceptionList
ErrorCode: − PIN_REQUIRED, + VOID_TOO_OLD (ruling R12); responses: − PinRequired, − UnauthorizedOrPinInvalid (bila tak dipakai; tes "tanpa komponen respons yang tidak dipakai")
```
```ts
// db.ts — version: 8
export type MockSale = Sale & { costTotal: number; voidedAt: number | null; voidedById: string | null; voidedByName: string | null;
  voidReason: string | null; voidChannel: "kasir" | "pemilik" | null; creditOverLimit: { excess: number; reason: string } | null };
// MockState: + exceptionReviews: Record<ExceptionKind, number | null>   (seed: semua null)
// (ruling R12) MockSale + voidRefund: number | null  (tunai yang keluar dari laci shift buka saat void transaksi shift lama; null bila tidak)
export const VOID_MAX_DAYS = 7;   // hari kalender WIB (K28)
export function kasirVoidWindow(sale: MockSale, shift: MockShift | null, now: number): "shift_ini" | "shift_lama" | "terlalu_lama";   // murni, dites kedua tepi
// mocks/exceptions.ts (murni)
export function cashierExceptions(state: Readonly<MockState>, kind: ExceptionKind): CashierException[];   // terbaru dulu, semua umur
export function exceptionAttention(state: Readonly<MockState>): ExceptionAttention[];                     // at > reviewedAt
export function reviewExceptions(state: MockState, kind: ExceptionKind, upTo: number, now: number): void; // max(old, min(upTo, now))
// kasir
export function ReasonDialog(props: { open: boolean; title: string; description: string; confirmLabel: string;
  pending: boolean; error?: string; onSubmit(reason: string): void; onCancel(): void }): JSX.Element;   // Alasan wajib (trim), Esc/Kembali, fokus ke isian
// (cek ulang) isian Alasan memakai useScanGuard + ScannedAlert (pola OwnerPinDialog/tunai-tab): rentetan scanner + Enter
// di isian yang terfokus TIDAK boleh mengirim kode barang sebagai alasan (membatalkan transaksi) — isian dikosongkan, tanpa submit.
// use-submit-sale: prompt { kind: "ownerPin" } → { kind: "creditReason"; problem: CreditLimitProblem; error: string | null }; confirmPin → confirmReason(reason)
```
Aturan server (K28/K30): void kasir berurutan sesi → 404 → sudah batal → 200 → alasan (422) → tanpa shift 409 `SHIFT_CLOSED` → `kasirVoidWindow`: `shift_ini` → `applyVoid` seperti sekarang (`cashSales`/`salesCount` shift ini turun); **(ruling R12)** `shift_lama` → stok kembali, kasbon −kredit (`saleId`; saldo boleh minus — Q8), bila bagian tunai (`payments` `cash`) > 0 tambah `shift.saleRefunds { amount: bagian tunai }` di shift yang **buka** dan `voidRefund` = jumlah itu; bagian QRIS tidak menyentuh laci; `closedShifts` lama tidak diubah; `terlalu_lama` → 409 `VOID_TOO_OLD`; lalu `voidedAt = now` (jam server), `voidedById/Name` = pengguna sesi, `voidReason` (trim), `voidChannel = "kasir"`. Void pemilik (jawaban pemilik Q1/Q8): sesi pemilik → 404 → sudah batal → 200 → alasan → shift penjualan masih buka 409 `IN_OPEN_SHIFT` → stok kembali, kasbon −kredit (saldo boleh minus; pelunasan tidak dibatalkan), `cashSales` tidak diubah, **tanpa** `saleRefunds`, `voided*` dengan `voidChannel = "pemilik"`; umur penjualan tidak dibatasi. Kasbon lewat limit: `creditExcess` ada & alasan kosong → 409 `CREDIT_LIMIT` (body lama); alasan ada → simpan `creditOverLimit = { excess, reason }`. Respons kasir (`toPublicSale`) membuang `voided*` (kecuali `status`), `creditOverLimit`, `costTotal`.

**(cek ulang) Definisi yang mengunci angka:** (1) `excess` tersimpan = `min(attempted, balance + attempted − creditLimit)` — bagian kasbon **ini** di atas limit, agar Σ butir `lewat {Rp}` tidak menghitung dobel saat pelanggan yang sudah di atas limit berkasbon lagi; kalimat dialog `… sebesar {Rp}` memakai `balance + attempted − creditLimit` dari `CreditLimitProblem` (tampilan saja). Alasan kosong setelah trim = tanpa alasan (409 `CREDIT_LIMIT`); alasan terkirim padahal tidak melewati limit (limit dinaikkan di sela) → diabaikan, `creditOverLimit = null`. (2) `CashierException` per jenis: `batal_transaksi` → `at = voidedAt`, `kasirName = voidedByName`, `amount = sale.total`; `batal_pelunasan` → `at = cancelledAt`, `kasirName = cancelledByName`, `amount = payment.amount`; `kasbon_lewat_limit` → `at = sale.createdAt`, `kasirName = sale.kasirName`, `amount = creditOverLimit.excess`. (3) `applyVoid` mengoreksi laci hanya bila `sale.shiftId === s.shift?.id` (bukan lagi `createdAt ≥ openedAt`); jalur pemilik tidak pernah memanggil koreksi laci. Cek shift & `applyVoid` dalam satu bagian sinkron (setelah `readJson`), seperti `createSale`.

Kasir UI: jendela bayar — 409 `CREDIT_LIMIT` membuka `ReasonDialog` `Kasbon melewati limit` (isi dari `CreditLimitProblem`), kirim ulang dengan `saleId` sama + `creditLimitReason`; galat setelah alasan tampil di dialog. Riwayat (jawaban pemilik J0) — daftar dari `listShiftSales` (shift yang sedang buka), judul `Riwayat shift ini`, kosong `Belum ada transaksi di shift ini`; `ReasonDialog` `Batalkan {nomor}?`; (cari struk lama R12 = T5); menutup → fokus ke kolom scan. Teks tab Kasbon `Melebihi limit — perlu alasan`.

**Tes yang berubah karena ruling (asersi boleh diganti, disebut di laporan):** `payment-dialog.test.tsx` "kasbon Pak Joko 36.000 → CREDIT_LIMIT → PIN pemilik 999999 → tersimpan" → alasan; `history-sheet.test.tsx` "Batalkan: PIN salah… PIN 999999 + alasan" & "alasan kosong → tombol kirim nonaktif" → dialog alasan; `payment-model.test.ts` (`ownerPin` → `creditLimitReason`); `sales.test.ts` / `sales-ledger.test.ts` hanya kasus PIN void/kredit (403/401 PIN) → alasan; (ruling R12) kasus void penjualan shift lama tidak lagi 409 melainkan pengembalian dari laci shift buka / 409 `VOID_TOO_OLD`; `contract.test.ts` kasus `VoidRequest`/`SaleRequest` `ownerPin`; `error-messages.test.ts` `PIN_REQUIRED`; `owner-pin-dialog.test.tsx` dihapus; e2e `kasbon melebihi limit butuh PIN pemilik` → `… butuh alasan`; (jawaban pemilik J0) teks `Riwayat hari ini` → `Riwayat shift ini` dan `Belum ada transaksi hari ini` → `Belum ada transaksi di shift ini` di `history-sheet.test.tsx`, `kasir-gate.test.tsx`, dan e2e yang memakainya; nama query key `getListTodaySalesQueryKey` → `getListShiftSalesQueryKey` (asersi "ditandai basi" sama); (cek ulang 2) `sales.test.ts` describe "printSale & listTodaySales": "penjualan hari ini (Asia/Jakarta), terbaru dulu" diganti kasus J0 (23.59 & 00.00 di shift yang sama keduanya tampil, terbaru dulu) dan "listTodaySales tanpa sesi → 401" → URL `/api/sales/shift` (asersi 401 sama); `sales-ledger.test.ts` "respons createSale/listTodaySales/void …" hanya URL `/api/sales/today` → `/api/sales/shift` + body void tanpa `ownerPin` (asersi key sama). Pemanggil `/api/sales/today` di luar ini tidak ada (grep `sales/today\|ListTodaySales` di `web/src` & `web/e2e` harus bersih kecuali gen yang dibuat ulang); (cek ulang) `owner-products.test.ts` "mutasi: Rina jual 2 Indomie lalu batal" hanya body `voidSale` (tanpa `ownerPin`), asersi tetap. **Harus tetap hijau tanpa ubah asersi:** semua tes jendela bayar lain (tunai, nominal cepat, kurang, klik ganda, server mati, QRIS, campuran, printer gagal, Esc), Riwayat (daftar, kosong, cetak ulang, printer gagal, Esc), `kasir-screen.test.tsx`, `customer-picker.test.tsx`, login PIN (`auth-shift.test.ts`, `staff.test.ts`), Beranda (`beranda-page.test.tsx`, `home-model.test.ts` — fixture `Attention` boleh ditambah `exceptions: []`).

- [ ] **Step 1: Tulis test yang gagal**
```ts
// sales.test.ts
test("void kasir tanpa PIN: alasan kosong → 422; benar → 200, stored {voidedAt: jam server, voidedById: Rina, voidedByName: 'Rina', voidReason, voidChannel: 'kasir'}", …);
test("(ruling R12) void kasir penjualan shift A (ditutup) saat shift B buka: campuran tunai 30.000 (diterima 50.000, kembalian 20.000) + QRIS 20.000 + kasbon 10.000 → stok kembali, kasbon −10.000, B.saleRefunds [{30.000}] (bagian tunai `payments` cash = uang yang tertinggal di laci, BUKAN cashReceived 50.000), B.cashSales & B.salesCount tetap, closedShifts A tidak berubah, voidRefund 30.000", …);
// (cek ulang 2) "tutup B → expectedCash turun 30.000" dipindah ke T5: penjumlahan saleRefunds di tutup shift baru ada di T3 (paralel di gel. 3)
test("(cek ulang 2, Q8) void kasir shift lama berkasbon 100.000 yang sudah dicicil 60.000 → saldo −40.000, pelunasan tetap aktif; lalu kasbon 550.000 (limit 500.000) → 409 CREDIT_LIMIT, dengan alasan excess = 10.000 (= saldo + kasbon − limit)", …);
test("(ruling R12) batas 7 hari kalender WIB (now Kamis 5 Nov 23.59 WIB): jual Kamis 29 Okt 00.00 WIB → boleh; jual Rabu 28 Okt 23.59 WIB → 409 VOID_TOO_OLD; tepi kedua: now Jumat 6 Nov 00.00 → jual 29 Okt 00.00 → 409", …);
test("(ruling R12) QRIS-saja shift lama → tanpa baris saleRefunds; tanpa shift buka → 409 SHIFT_CLOSED; void ulang → 200 tanpa baris kedua", …);
test("(jawaban pemilik J0) listShiftSales hanya shift buka (shift lewat tengah malam: jual 23.50 & 00.10 keduanya tampil; jual shift Rina pagi tidak tampil di shift Budi); lookupSales q='0145' → shift lain ≤ 7 hari saja, tidak memuat shift buka; (cek ulang 2) item membawa customerName (null bila tanpa pelanggan), key lain = allowlist kasir", …);
test("(cek ulang) body lama {ownerPin: '000000', reason} → 200 (ownerPin diabaikan, tidak ada jalur PIN); respons kasir tanpa voidReason/voidedById/voidedByName/voidChannel/creditOverLimit/costTotal", …);
test("(cek ulang) kasbon lewat limit dua kali (limit 500.000, saldo 490.000: +20.000 lalu +20.000) → excess 10.000 lalu 20.000; butir 'lewat Rp30.000'", …);
test("kasbon Pak Joko lewat limit tanpa alasan → 409 CREDIT_LIMIT {balance, creditLimit, attempted}; dengan alasan → 201, creditOverLimit {excess, reason}; replay saleId → 200", …);
// owner-sales.test.ts
test("list per tanggal WIB + q nomor struk; shiftOpen benar; 401 tanpa sesi pemilik; 422 tanggal salah", …);
test("void pemilik penjualan shift tutup: stok kembali, kasbon −kredit (saleId), cashSales shift tutup & shift buka tidak berubah, stored voided* channel pemilik + voidedById pemilik; detail memuat voided", …);
test("void pemilik penjualan shift buka → 409 IN_OPEN_SHIFT; alasan kosong → 422; void ulang → 200", …);
test("(jawaban pemilik Q8) void pemilik kasbon 100.000 yang sudah dicicil 60.000 → saldo −40.000, pelunasan tetap aktif; void 40 hari lalu boleh (tanpa batas umur), tanpa baris laci", …);
test("(cek ulang) detail penjualan yang dibatalkan KASIR → voided {at: jam server, byId: Rina, byName: 'Rina', reason, channel: 'kasir'}; penjualan aktif → voided null", …);
// exceptions.test.ts
test("tiga jenis dari data: void kasir, batal pelunasan kasir, kasbon lewat limit (penjualan dibatalkan tidak ikut lewat limit); batal oleh pemilik tidak ikut", …);
test("(ruling R12) void kasir transaksi shift lama → batal_transaksi dengan fromClosedShift true, refund = bagian tunai", …);
test("menumpuk sejak reviewedAt tanpa batas umur: kejadian 40 hari lalu tetap terhitung; from/to tanggal WIB", …);
test("review upTo: kejadian sesudah upTo tetap muncul; upTo di masa depan dijepit ke now; review ulang dengan upTo lebih kecil tidak memundurkan", …);
// owner-summary.test.ts — attention.exceptions [] di seed; setelah void kasir → [{batal_transaksi, 1, total, from, to}]; butir lama tidak berubah;
//   (jawaban pemilik Q8) pelanggan bersaldo minus tidak masuk overdueCredit
// db.test.ts — state v7 tersimpan → seed v8; history.test.ts — setiap penjualan riwayat punya shiftId closedShifts yang memuat jamnya
// reason-dialog.test.tsx — isian Alasan terfokus; kosong/spasi → tombol nonaktif; Enter kirim trim; Esc/Kembali menutup; pending → tidak bisa ditutup;
//   (cek ulang) ketikan scanner (< 30 ms) + Enter di isian → ScannedAlert, isian kosong, onSubmit TIDAK dipanggil
// payment-dialog.test.tsx — Pak Joko lewat limit → dialog 'Kasbon melewati limit' + isi angka → alasan → tersimpan dengan saleId sama, body creditLimitReason
// history-sheet.test.tsx — judul 'Riwayat shift ini'; penjualan shift ini: Batalkan → 'Batalkan #…?' → alasan → 'Transaksi dibatalkan', 'Dibatalkan'; penjualan shift sebelumnya (hari sama) tidak tampil; 409 → pesan di dialog
```
- [ ] **Step 2:** FAIL. **Step 3:** kontrak + gen, mock, lalu UI kasir (dialog alasan mengikuti mockup T0 yang disetujui).
- [ ] **Step 4: Dokumen** — `frontend-design.html` §12c: baris "PIN & kunci layar" menghapus "PIN pemilik (batal/retur, melewati limit kasbon) berupa sheet 400 px…" dan menggantinya dengan "Dialog alasan (batal transaksi, batal pelunasan, kasbon lewat limit): sheet 400 px, isian Alasan wajib — ruling R1/R5 5 Nov 2026"; baris Riwayat "(butuh PIN pemilik)" → "(isi = shift yang sedang buka; alasan wajib; transaksi shift lama ≤ 7 hari lewat Cari nomor struk, uang tunai keluar dari laci shift ini — jawaban pemilik J0, ruling R12)"; "Yang berubah" + butir ruling R1–R5. **(cek ulang) Baris PIN pemilik lain yang wajib ikut diubah** (grep `PIN pemilik` harus bersih di luar catatan ruling): §12c baris `Cakupan` ("kunci layar + PIN, PIN pemilik, Riwayat" → "…, dialog alasan, Riwayat"); §4 baris `Riwayat` ("batal/retur butuh PIN pemilik" → "batal hanya transaksi shift yang sedang buka, alasan wajib"); §5 tab `Kasbon` ("Melebihi limit → minta PIN pemilik" → "Melebihi limit → alasan wajib, tercatat"); `docs/PRD.html` paragraf batas hak akses kasir + K-08 + K-10 (PIN pemilik → alasan wajib + tercatat + Perlu perhatian; ruling R1–R5); `docs/specs/2026-10-17-arsitektur-kasir-design.html` baris "Kasbon melebihi limit" (→ alasan, `creditOverLimit`) dan daftar kode galat (`PIN_REQUIRED` → `OUTSIDE_SHIFT`, `IN_OPEN_SHIFT`, `VOID_TOO_OLD`); §7 tutup shift: rumus uang seharusnya + pelunasan tunai − pengembalian transaksi lama (ruling R12).
- [ ] **Step 5:** PASS + pemeriksaan wajib; tangkapan 1366×768 dialog alasan & Riwayat di laporan.
- [ ] **Step 6:** commit `feat(api): kasir tanpa PIN pemilik — batal beralasan, kasbon lewat limit beralasan, pengecualian tercatat` lalu `feat(kasir): dialog alasan menggantikan PIN pemilik` lalu `docs: §12c — PIN pemilik dihapus dari kasir`.

---

### Task 3: Tutup shift dengan pelunasan tunai dan pengembalian transaksi lama (ruling R12)

**Model:** Opus · **Gelombang:** 3 (paralel dengan T2b) · **Risk class:** risky (uang laci, layar jadi)

**Files:** Modify `web/src/mocks/handlers/shift.ts` (+ `auth-shift.test.ts`), `web/src/features/kasir/shift/shift-closure-dialog.tsx` (+ `close-shift-dialog.test.tsx`). (T2b tidak menyentuh file ini.)

**Interfaces — Consumes:** T2 `creditPaymentsOf`, `MockShift.saleRefunds`; `supplierPaymentsOf`. **Produces:** closure `creditPayments = creditPaymentsOf(shift)`, (ruling R12) `saleRefunds = saleRefundsOf(shift)` (Σ, fungsi lokal di `handlers/shift.ts`), `expectedCash = openingCash + cashSales − supplierPayments + creditPayments − saleRefunds`, disimpan juga di `closedShifts`; baris `Pelunasan kasbon` di `ClosureResult` (`ResultRow` + `signedRupiah`), **di atas `Bayar supplier`** (pra-cek, mockup); baris `Pengembalian transaksi lama` `-Rp…` di bawah `Bayar supplier` (ruling R12). Tes T3 mengisi `saleRefunds` langsung lewat `mockDb.update` (T2b paralel).

- [ ] **Step 1: Tulis test yang gagal**
```ts
// auth-shift.test.ts — modal 200.000, jual tunai 150.000, bayar supplier dari laci 50.000, pelunasan Tunai 75.000 (diterima 100.000), QRIS 30.000
test("uang seharusnya + pelunasan tunai saja (bukan uang diterima)", async () =>
  expect(await json(await post("/api/shifts/current/close", { countedCash: 375_000 }))).toMatchObject(
    { creditPayments: 75_000, supplierPayments: 50_000, expectedCash: 375_000, difference: 0 }));
test("dibatalkan kasir di shift yang sama → creditPayments 0", …);
test("(pra-cek) pelunasan shift lama dibatalkan pemilik saat shift ini buka → creditPayments shift ini tetap 0; closedShifts lama tidak berubah", …);
test("(ruling R12) saleRefunds [30.000] di shift ini → closure saleRefunds 30.000, expectedCash = 375.000 − 30.000", …);
// close-shift-dialog.test.tsx (fixture closure)
test("hasil: 'Pelunasan kasbon' '+Rp75.000' di atas 'Bayar supplier' dan 'Uang seharusnya'", …);
test("creditPayments 0 → tidak ada baris 'Pelunasan kasbon'", …);
test("(ruling R12) saleRefunds 30.000 → 'Pengembalian transaksi lama' '-Rp30.000' di bawah 'Bayar supplier' dan di atas 'Uang seharusnya' (cek ulang 2: urutan Pelunasan kasbon → Bayar supplier → Pengembalian transaksi lama → Uang seharusnya); 0 → tidak tampil", …);
```
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS; tes tutup shift lama hijau tanpa ubah asersi + pemeriksaan wajib.
- [ ] **Step 5:** commit `feat(shift): pelunasan kasbon tunai menambah uang seharusnya di tutup shift`.

---

### Task 4: Kasir — lembar `Pelunasan kasbon` (pra-cek, ruling R7/R8)

**Model:** Sonnet (label ulang pemilik — UI; re-review tetap) · **Gelombang:** 4 (paralel) · **Risk class:** risky (kembalian, arah uang, kirim ulang, fokus)

**Files:** Create `web/src/features/kasir/credit/repayment-model.ts` (+ test), `repayment-dialog.tsx` (+ test), `use-submit-repayment.ts`; Modify `web/src/features/kasir/shift/shift-actions.tsx` (tombol), `web/src/features/kasir/payment/customer-picker.tsx` (prop `mode`) (+ `customer-picker.test.tsx`: kasus baru Q8 & mode pelunasan saja — cek ulang 2), `docs/specs/2026-10-17-frontend-design.html` (§12c "Yang berubah": butir F3c-1 — tombol & lembar `Pelunasan kasbon`, pelunasan di Riwayat, baris tutup shift).

**Interfaces — Consumes:** gen `useCreateCreditPayment`, `getListShiftCreditPaymentsQueryKey` (jawaban pemilik J0), `getSearchCustomersQueryKey`, `useGetKasirSettings`, `KasirCreditPaymentInput`, `KasirCreditPayment`, `Customer`; `CashFields`, `ChangeLine`, `MoneyField`, `QrisPanel`, `CustomerPicker`, `parseRupiah`, `formatRupiah`, `newId`, `useServerHealth`, `focusScanBox`, `pesanError`, T2 `repaymentProblem`. **Produces:**
```ts
export type RepaymentDraft = { customer: Customer | null; amount: string; method: "tunai" | "qris"; received: string };
export type RepaymentState = { canSubmit: boolean; amount: number | null; change: number | null;
  shortage: number | null; balanceAfter: number | null; problem: string | null };
export function repaymentState(d: RepaymentDraft): RepaymentState;
export function toRepaymentInput(id: string, d: RepaymentDraft, s: RepaymentState, print: boolean): KasirCreditPaymentInput;
export function useSubmitRepayment(onSaved: (p: KasirCreditPayment) => void): { submit(input: KasirCreditPaymentInput): void;
  pending: boolean; error: string | null; notice: string | null };   // satu request sekaligus, retry: false
export function RepaymentDialog(props: { open: boolean; onClose: () => void }): JSX.Element;
// CustomerPicker: + mode?: "kasbon" | "pelunasan" (bawaan "kasbon" = perilaku & teks lama)
// (jawaban pemilik Q8) CustomerInfo: saldo < 0 → `Lebih bayar {Rp} · Limit {Rp}`† (bukan `Saldo -Rp…`); kasus baru, tes lama tidak menyentuhnya
```
Perilaku: `id = newId()` dibuat saat lembar dibuka dan dipakai ulang sampai tersimpan; respons 200 dengan pelanggan/jumlah/metode berbeda → `notice` `Pelunasan ini sudah tersimpan sebelumnya`; Enter = tombol utama, Esc = Batal (tidak saat pending); `Cetak struk` lokal, bawaan `settings.autoPrint` (R8; **tidak** memakai/mengubah `useCart().printReceipt`); tombol header aktif walau keranjang berisi dan **keranjang tidak berubah** (R7); hasil tampil sampai `Tutup`; menutup → `focusScanBox()`; sukses meng-invalidate pelunasan shift ini & cari pelanggan; `printStatus: gagal` → toast `Struk gagal dicetak — cetak ulang dari Riwayat`.

- [ ] **Step 1: Tulis test yang gagal**
```ts
// repayment-model.test.ts — Bu Sari saldo 120.000
test.each([
  ["50.000", "tunai", "100.000", { canSubmit: true, change: 50_000, shortage: null, balanceAfter: 70_000, problem: null }],
  ["50.000", "tunai", "40.000", { canSubmit: false, change: null, shortage: 10_000, balanceAfter: 70_000, problem: null }],
  ["50.000", "qris", "", { canSubmit: true, change: null, shortage: null, balanceAfter: 70_000, problem: null }],
  ["130.000", "tunai", "200.000", { canSubmit: false, problem: "Melebihi sisa kasbon Rp120.000" }],
  ["0", "qris", "", { canSubmit: false, problem: "Jumlah minimal Rp1" }],
])("nominal %s %s diterima %s", (amount, method, received, want) =>
  expect(repaymentState({ customer: sari, amount, method, received })).toMatchObject(want));
test("saldo 0 atau minus → Pelanggan ini tidak punya kasbon; tanpa pelanggan → tidak bisa kirim", …);
test("toRepaymentInput: QRIS → cashReceived null; Tunai → cashReceived = uang diterima", …);
// repayment-dialog.test.tsx (MSW + shift Rina)
test("tombol 'Pelunasan kasbon' membuka lembar; pemilih tanpa 'Tambah pelanggan' dan tanpa Mbak Dewi (saldo 0); pilih Bu Sari → 'Sisa kasbon Rp120.000 · Limit Rp500.000'", …);
test("'Lunas semua' mengisi nominal; 'Cetak struk' tercentang mengikuti autoPrint seed (true) → body print true; dimatikan → false; useCart.printReceipt tidak berubah", …);
test("Tunai 50.000 diterima 100.000 → KEMBALIAN Rp50.000, 'Sisa kasbon setelah ini Rp70.000'; Enter → 'Pelunasan tersimpan', 'Sisa kasbon Rp70.000'", …);
test("(jawaban pemilik Q4) tab QRIS → satu tombol 'Sudah masuk' langsung menyimpan (tanpa langkah kedua); nominal > sisa → 'Melebihi sisa kasbon Rp120.000' dan tombol nonaktif; Lunas semua → 'Rp0 · lunas'", …);
// (cek ulang 2) kasus Q8 ini ditaruh sebagai kasus BARU di customer-picker.test.tsx (file milik T4; kasus lama tidak diubah), bukan di repayment-dialog.test (mode pelunasan memakai owing=true, saldo minus tak pernah muncul)
test("(jawaban pemilik Q8) tab Kasbon jendela bayar: pelanggan saldo −40.000 → 'Lebih bayar Rp40.000 · Limit Rp500.000'", …);
test("keranjang berisi 2 baris → tombol tetap aktif; setelah simpan & Tutup keranjang tetap 2 baris", …);
test("scan (ketikan < 30 ms + Enter) saat lembar terbuka tidak menambah barang ke keranjang", …);
test("respons hilang (server menyimpan lalu HttpResponse.error) → pesan; klik lagi → id sama → 200; satu entri buku & laci", …);
test("klik ganda 'Simpan pelunasan' → satu request", …);
test("offline → tombol nonaktif; 409 SHIFT_CLOSED → 'Shift belum dibuka'; 422 → pesan server di lembar", …);
test("printer-gagal + Cetak struk → toast 'Struk gagal dicetak — cetak ulang dari Riwayat'", …);
test("Esc menutup dan fokus kembali ke kolom scan; Esc diabaikan saat pending", …);
```
`payment-dialog.test.tsx` & kasus lama `customer-picker.test.tsx` tetap hijau tanpa perubahan asersi (mode bawaan `kasbon`; (cek ulang 2) kasus baru boleh ditambah).
- [ ] **Step 2:** FAIL. **Step 3:** implementasi + butir §12c. **Step 4:** PASS + pemeriksaan wajib; tangkapan 1366×768 di laporan.
- [ ] **Step 5:** commit `feat(kasir): pelunasan kasbon tunai atau QRIS dengan kembalian` + `docs: §12c — lembar pelunasan kasir`.

---

### Task 5: Kasir — Riwayat shift ini: pelunasan, batal beralasan, cetak ulang, dan cari struk lama (pra-cek, ruling R2/R12, jawaban pemilik J0)

**Model:** Sonnet (label ulang pemilik — UI; re-review tetap) · **Gelombang:** 5 (paralel) · **Risk class:** risky (uang laci: pengembalian dari shift buka, layar jadi, fokus)

**Files:** Modify `web/src/features/kasir/history/history-sheet.tsx` (+ `history-sheet.test.tsx`); Create `web/src/features/kasir/history/credit-payment-row.tsx`, (ruling R12) `web/src/features/kasir/history/old-sale-search.tsx` (+ test).

**Interfaces — Consumes:** gen `useListShiftCreditPayments`, `usePrintCreditPayment`, `useCancelCreditPayment`, `getListShiftCreditPaymentsQueryKey`, `getListShiftSalesQueryKey`, `getSearchCustomersQueryKey`, (ruling R12) `useLookupSales`, `useVoidSale`, `KasirCreditPayment`, `Sale`, (cek ulang 2) `KasirLookupSale`; T3 penjumlahan `saleRefunds` di tutup shift; T2b `ReasonDialog`; `CREDIT_METHOD_LABEL`, `pesanError`, `focusScanBox`. **Produces:** `CreditPaymentRow({ payment, printing, onPrint, onCancel })` (semua pelunasan di daftar milik shift ini → semua yang aktif boleh dibatalkan; 409 `OUTSIDE_SHIFT` hanya bila shift berganti di sela); pelunasan **berselang-seling** dengan penjualan urut `createdAt` terbaru dulu (mockup); keadaan kosong `Belum ada transaksi di shift ini` hanya bila keduanya kosong. (ruling R12) `OldSaleSearch()`: bagian `Transaksi shift sebelumnya` di bawah daftar, isian `Cari nomor struk` (debounce 150 ms, `useScanGuard` agar scan barcode tidak jadi kueri), hasil `lookupSales`, `Batalkan` → `ReasonDialog` dengan kalimat bagian tunai/QRIS/kasbon dari `sale.payments` (tampilan saja; angka laci dari server; (cek ulang 2) Tunai = `payments` cash, bukan `cashReceived`; tiap kalimat hanya tampil bila bagiannya > 0; nama dari `KasirLookupSale.customerName`) → `voidSale` → toast `Transaksi dibatalkan`, invalidate lookup & `listShiftSales`.

- [ ] **Step 1: Tulis test yang gagal** — baris `Pelunasan · Bu Sari` / `Tunai 10.05 · sisa Rp70.000` / `Rp50.000` di antara penjualan sesuai jam; `Cetak ulang pelunasan Bu Sari 10.05` → toast `Struk dicetak` (`printer-gagal` → `Struk gagal dicetak`); `Batalkan pelunasan Bu Sari 10.05` → dialog `Batalkan pelunasan Rp50.000?` + `Kasbon Bu Sari bertambah lagi Rp50.000 dan uang Rp50.000 dikeluarkan dari laci.` (QRIS tanpa kalimat laci) → alasan → toast `Pelunasan dibatalkan`, tanda `Dibatalkan`, `Batalkan` hilang & `Cetak ulang` nonaktif; (jawaban pemilik J0) pelunasan shift Rina tidak tampil di Riwayat shift Budi; 409 `OUTSIDE_SHIFT` → pesan di dialog; respons batal hilang lalu ulang → satu baris laci; tanpa pelunasan → daftar lama persis; menutup Riwayat → fokus ke kolom scan. (ruling R12) `old-sale-search.test.tsx`: cari `0145` → transaksi shift kemarin `20261104-0145 · 4 Nov 13.05`; transaksi shift ini tidak muncul di hasil; campuran tunai 30.000 + QRIS 20.000 → dialog `Tunai Rp30.000 dikembalikan dari laci shift ini.` + `QRIS Rp20.000 dikembalikan di luar laci.`; alasan → toast `Transaksi dibatalkan`, baris `Dibatalkan`, state: `shift.saleRefunds` [30.000]; (cek ulang 2, dipindah dari T2b — butuh T3) lalu `POST /api/shifts/current/close` → `saleRefunds` 30.000 dan `expectedCash` 30.000 lebih kecil daripada tanpa batal; kasbon 10.000 → `Kasbon {nama} dikurangi Rp10.000.`; QRIS-saja → tanpa kalimat Tunai; transaksi 8 hari lalu tidak muncul; 409 `VOID_TOO_OLD` (jam lewat tengah malam di sela) → `Transaksi lebih dari 7 hari — batalkan dari app pemilik`; tanpa hasil → `Tidak ada transaksi dengan nomor itu dalam 7 hari`; ketikan scanner di isian → `ScannedAlert`, tanpa request; Esc menutup dialog lalu Riwayat, fokus ke kolom scan. Tes Riwayat T2b & lama hijau tanpa ubah asersi.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS + pemeriksaan wajib.
- [ ] **Step 5:** commit `feat(kasir): riwayat pelunasan — cetak ulang dan batal beralasan` lalu `feat(kasir): cari struk lama dan batalkan dengan uang dari laci shift ini`.

---

### Task 6: Pemilik — tab Kasbon (pra-cek, mockup)

**Model:** Sonnet · **Gelombang:** 4 (paralel) · **Risk class:** UI angka keputusan (review penuh + re-review)

**Files:** Create `web/src/features/owner/kasbon/kasbon-page.tsx` (+ test), `customer-row.tsx`, `customer-page.tsx` (placeholder `Segera hadir`, diganti T7); Modify `web/src/app/owner-routes.tsx` (`kasbon/$customerId`), `web/src/features/owner/pages.tsx` (hapus `KasbonPage` placeholder), `web/src/features/owner/index.ts`, `web/src/features/owner/common/sub-page-header.tsx` (`BackFallback` + `"/owner/kasbon"`), **`web/src/features/owner/owner-layout.test.tsx` (pra-cek)**.

**Interfaces — Consumes:** gen `useListOwnerCustomers`, `OwnerCustomerList`, `OwnerCustomerRow`, `CreditAge`; `Section`, `RowList` (`../products/detail/section`), `FitAmount`, pola `StatusBadge`, `formatRupiah`, `pesanError`. **Produces:** `KasbonPage`; baris = `<Link to="/owner/kasbon/$customerId">`; rute detail terdaftar agar T7 hanya mengisi `customer-page.tsx`. Angka kelompok **dari `ages` server** — UI tidak menjumlah.

**(pra-cek) Tes kerangka yang berubah:** lima tes `owner-layout.test.tsx` memakai `/owner/kasbon` + `Segera hadir` sebagai halaman contoh ("judul halaman = tab aktif", "header tidak lagi menampilkan ShaziaMart…", "offline setelah data dimuat…", "offline sebelum data apa pun dimuat…"). Ganti **hanya penanda halamannya** dari `findByText("Segera hadir")` ke `findByText("Total kasbon")` (perilaku yang diuji sama); nama tes kedua menjadi "header tidak lagi menampilkan ShaziaMart". Asersi lain tidak diubah.

- [ ] **Step 1: Tulis test yang gagal** (MSW + seed) — kartu `Total kasbon` = `totalBalance`, `{debtorCount} pelanggan`; tiga baris `0–7 hari` · `8–30 hari` · `Lebih dari 30 hari` (urutan ini) dengan `{k} pelanggan` & total dari `ages`, baris > 30 hari bertanda ikon + teks; bagian `Pelanggan` `urut sisa terbesar`: Bu Tini (Rp640.000) pertama; baris `Bu Tini` / `45 hari · limit Rp1.000.000`, umur > 30 → tanda warn; Mbak Dewi (saldo 0) tidak tampil, cari `dewi` → tampil `Lunas · limit Rp500.000`; (jawaban pemilik Q8) pelanggan saldo −40.000 (data ditanam) → tampil setelah yang berutang dengan `Lebih bayar Rp40.000`, tidak menambah `Total kasbon` maupun kelompok; cari nomor HP; cari tanpa hasil → `Tidak ada pelanggan yang cocok`; klik baris → `/owner/kasbon/{id}`; tanpa pelanggan berutang → `Belum ada kasbon`; galat → `pesanError` + `Coba lagi`; butir Beranda `Kasbon > 30 hari` membuka halaman ini.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS + pemeriksaan wajib; tangkapan 360 & 1280 + daftar periksa di laporan.
- [ ] **Step 5:** commit `feat(owner): tab kasbon — pelanggan urut sisa dengan ringkasan umur`.

---

### Task 7: Pemilik — detail pelanggan (pra-cek, ruling R2)

**Model:** Sonnet (label ulang pemilik — UI; re-review tetap) · **Gelombang:** 5 (paralel; setelah T6) · **Risk class:** risky (arah uang, idempoten)

**Files:** Modify `web/src/features/owner/kasbon/customer-page.tsx` (+ test); Create `history-row.tsx`, `owner-payment-sheet.tsx` (+ test), `limit-sheet.tsx`, `cancel-payment-sheet.tsx` (semua di `features/owner/kasbon/`). Tanpa file bersama.

**Interfaces — Consumes:** gen `useGetOwnerCustomer`, `useCreateOwnerCreditPayment`, `useSetOwnerCustomerCreditLimit`, `useCancelOwnerCreditPayment`, `getGetOwnerCustomerQueryKey`, `getListOwnerCustomersQueryKey`, `getGetOwnerTodaySummaryQueryKey`, `OwnerCustomer`, `CreditHistoryEntry`; T2 `repaymentProblem`, `CREDIT_METHOD_LABEL`; `SubPageHeader`, `Section`, `RowList`, `FitAmount`, `Sheet`, `Dialog`, `parseRupiah`, `formatRupiah`, `relativeDayTime`, `newId`. **Produces:** `CustomerPage`; `OwnerPaymentSheet({ customer, onSaved })` (id dibuat saat lembar dibuka, dipakai ulang sampai tersimpan; nonaktif saat pending); `CancelPaymentSheet({ entry, customer, onDone })`: ketuk baris pelunasan aktif → lembar; `payment.inOpenShift` → tanpa tombol, keterangan `Masih di shift yang buka — batalkan dari kasir`; jalur kasir Tunai → kalimat `Uang dikembalikan pemilik; laci kasir tidak berubah.`; alasan wajib; 409 `IN_OPEN_SHIFT` (shift dibuka di sela) → pesan di lembar + muat ulang.

- [ ] **Step 1: Tulis test yang gagal** — kembali `‹ Kasbon`, eyebrow no. HP, judul nama; kartu `Sisa kasbon` + `Limit Rp… · kasbon tertua 45 hari`; riwayat terbaru dulu: `Kasbon · struk {nomor}` / `… · {kasir}`, `Pelunasan · Tunai di kasir`, `Pelunasan · Transfer ke pemilik`; dibatalkan → dicoret + `Dibatalkan` + `{alasan} · Rina · Hari ini 14.05` (jam dipatok); `Catat pelunasan` → `Transfer` terpilih, `Tidak masuk laci kasir.`, `Lunas semua` mengisi sisa, nominal > sisa → `Melebihi sisa kasbon Rp…` tombol nonaktif, `Sisa setelah ini Rp…`, `Simpan pelunasan` → toast `Pelunasan tersimpan`, saldo turun, body `method: "transfer"`; `Tunai ke pemilik` → body `titip`; respons hilang lalu simpan lagi → `id` sama, buku sekali; `Atur limit` di bawah saldo → catatan R7, `Simpan limit` → toast `Limit disimpan`; batal pelunasan Tunai kasir (shift sudah tutup) → kalimat pemilik, alasan → `Pelunasan dibatalkan`, tanpa perubahan laci (cek state); pelunasan kasir shift buka → tanpa tombol + keterangan; batal Transfer → tanpa kalimat laci; setelah batal fokus kembali ke judul halaman; saldo 0 → `Catat pelunasan` nonaktif; (jawaban pemilik Q8) saldo −40.000 → kartu `Lebih bayar` `Rp40.000` / `Limit Rp…`, `Catat pelunasan` nonaktif, baris kasbon yang dibatalkan pemilik tetap dicoret dengan alasan, pelunasan sebelumnya tetap aktif; 404 → `pesanError`.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS + pemeriksaan wajib; tangkapan 360 & 1280 + daftar periksa.
- [ ] **Step 5:** commit `feat(owner): detail pelanggan — riwayat, limit, pelunasan langsung, dan batal`.

---

### Task 7b: Pemilik — Perlu perhatian pengecualian, halaman tinjau, Transaksi + batal (ruling R4/R9/R12, jawaban pemilik Q1/Q2/Q8)

**Model:** Sonnet (label ulang pemilik — UI; re-review tetap) · **Gelombang:** 5 (paralel; setelah T2b & T6) · **Risk class:** risky (uang: batal transaksi; Beranda jadi)

**Files:** Modify `web/src/features/owner/home/home-model.ts` (+ `home-model.test.ts`: butir baru), `web/src/features/owner/home/attention-list.tsx` (ikon baru), `web/src/features/owner/more/lainnya-page.tsx` (+ test: baris `Transaksi`), `web/src/app/owner-routes.tsx` (`pengecualian/$kind`, `lainnya/transaksi`, `lainnya/transaksi/$saleId` dengan search `{tanggal?, q?}`), `web/src/features/owner/index.ts`, `web/src/features/owner/common/sub-page-header.tsx` (`BackFallback` + `"/owner"`, `"/owner/lainnya/transaksi"`); Create `web/src/features/owner/more/exceptions/exceptions-page.tsx` (+ test), `web/src/features/owner/more/sales/{sales-page.tsx (+ test), sale-detail-page.tsx (+ test), void-sale-sheet.tsx}`.

**Interfaces — Consumes:** gen `useListOwnerExceptions`, `useReviewOwnerExceptions`, `useListOwnerSales`, `useGetOwnerSale`, `useVoidOwnerSale`, query key `getGetOwnerTodaySummaryQueryKey`, `ExceptionAttention`, `OwnerSale`; `formatIsoDayMonth`, `formatDateLong`, `relativeDayTime`, `jakartaIsoDate`, `addIsoDays`, `Section`, `RowList`, `SubPageHeader`. **Produces:** `AttentionItem` baru (`icon: "exception-void" | "exception-repay" | "exception-limit"`, `tone: "warning"`, link `/owner/pengecualian/$kind`), `exceptionRange(from, to): string` (`5 Nov` / `2–5 Nov` / `28 Okt–5 Nov`; beda tahun memakai tahun) di `home-model.ts`; `ExceptionsPage`, `SalesPage`, `SaleDetailPage`.

(cek ulang) Posisi tiga butir baru di `attentionItems` mengikuti mockup T0 yang disetujui (bawaan: sesudah `Selisih kas`, sebelum `Kasbon > 30 hari`); `AttentionLink` + varian `{ to: "/owner/pengecualian/$kind", params: { kind } }`; tombol `Tandai sudah ditinjau` tidak tampil bila daftar kosong.

Perilaku: halaman tinjau memuat daftar lalu `Tandai sudah ditinjau` mengirim `upTo = at item terbaru yang tampil` (bukan jam klik) → invalidate ringkasan; transaksi `shiftOpen` → tanpa tombol batal + keterangan; batal = lembar alasan → `voidOwnerSale` → toast `Transaksi dibatalkan`, kartu `Dibatalkan` dengan alasan, nama, jam.

- [ ] **Step 1: Tulis test yang gagal** — `home-model.test.ts`: `exceptions` → tiga butir urutan K29 dengan teks Teks UI & rentang; `exceptionRange` (sehari, sebulan, lintas bulan, lintas tahun); butir lama tidak berubah. `beranda-page.test.tsx` **tidak diubah** dan hijau. `exceptions-page.test.tsx`: eyebrow `Belum pernah ditinjau`; baris void `#0145 · Rina` / alasan / `Rp52.000`; (ruling R12) void shift lama oleh kasir → keterangan `Shift sebelumnya · tunai dari laci Rp30.000`†; `Tandai sudah ditinjau` → body `upTo` = at terbaru; kejadian baru yang masuk setelah daftar dimuat tetap ada di butir Beranda; kosong → `Tidak ada yang perlu ditinjau`. `sales-page.test.tsx`: hari ini terbaru dulu, navigator hari, cari nomor struk, `Dibatalkan`. `sale-detail-page.test.tsx`: shift tutup → `Batalkan transaksi` → alasan kosong nonaktif → simpan → kartu `Dibatalkan` + `{alasan} · Pak Ahmad · Hari ini …`, stok & kasbon (cek state) kembali, `cashSales` shift tidak berubah; shift buka → tanpa tombol + keterangan; 409 `IN_OPEN_SHIFT` → pesan; detail penjualan yang dibatalkan kasir menampilkan alasan + `Rina` (R4: tersimpan & terlihat); (jawaban pemilik Q8) batal kasbon yang sudah dicicil → dialog menambah `Saldo {pelanggan} menjadi lebih bayar {Rp}.`† dan tetap bisa disimpan; fokus kembali ke judul setelah batal.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi sesuai mockup T0 `pengecualian`. **Step 4:** PASS + pemeriksaan wajib; tangkapan 360 & 1280 + daftar periksa.
- [ ] **Step 5:** commit `feat(owner): pengecualian kasir di perlu perhatian, tinjau, dan batal transaksi shift tutup`.

---

### Task 8: Server palsu — HPP per baris dan riwayat 63 hari (state v9) (pra-cek: versi)

**Model:** Opus · **Gelombang:** 4 (paralel; setelah T2b) · **Risk class:** risky (migrasi, HPP, ukuran state)

**Files:** Modify `web/src/mocks/db.ts` (+ test), `web/src/mocks/sale-rules.ts` (+ `sale-rules.test.ts`), `web/src/mocks/handlers/sales.ts` (+ `sales-ledger.test.ts`), `web/src/mocks/history.ts` (+ `history.test.ts`), `web/src/mocks/seed-data.ts` (+ test).

**Interfaces — Consumes:** `unitCost`, `saleCost`, `businessDay`, `daysBefore`, `rng`. **Produces:**
```ts
// db.ts — version: 9
export type MockSale = /* T2b */ & { lineCosts: (number | null)[] };
export type ReportRules = { thinMarginPermille: number; unsoldDays: number };
// MockState: + catalogSince: number; reportRules: ReportRules   (seed: awal hari riwayat pertama; {100, 30})
export function saleLineCosts(products: readonly MockProduct[], items: readonly SaleItem[]): (number | null)[];
// history.ts — HISTORY_DAYS = 63; volume 20–60 (akhir pekan ×1,3); SLOW_PRODUCTS = 6 (K11)
```
`commitSale` & `makeSale` mengisi `lineCosts`; `toPublicSale` membuang `lineCosts`. T8 tidak menyentuh `handlers/shift.ts` maupun UI.

- [ ] **Step 1: Tulis test yang gagal**
```ts
test("saleLineCosts per baris; HPP kosong → null; Σ (null = 0) = saleCost", () => {
  expect(saleLineCosts(products, [indomie(5), noCost(2)])).toEqual([13_000, null]);
  expect(saleCost(products, [indomie(5), noCost(2)])).toBe(13_000);
});
test("penjualan baru menyimpan lineCosts; HPP berubah setelahnya tidak mengubah lineCosts/costTotal", …);
test("respons createSale/listShiftSales/lookupSales/void tidak memuat lineCosts", …);
// history.test.ts (NOW = Jumat 23 Okt 2026 14.30 WIB)
test("riwayat 63 hari sebelum hari ini; hari ini kosong; tiap penjualan punya shiftId", …);
test("volume harian 20-60 (akhir pekan 26-78)", …);           // menggantikan asersi 40-160 milik test ini
test("lineCosts tiap penjualan riwayat sejajar items dan Σ = costTotal", …);
test("6 barang lambat: 3 tidak pernah terjual, 3 terakhir terjual 45-63 hari lalu; tidak ada FIXTURES di antaranya", …);
test("ukuran state seed < 4.000.000 karakter JSON", () =>
  expect(JSON.stringify(createSeedState(NOW)).length).toBeLessThan(4_000_000));
// db.test.ts — state v8 tersimpan → seed v9
```
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** seluruh `npx vitest run` PASS: tes Beranda, `owner-summary.test.ts`, `exceptions.test.ts`, kedaluwarsa/opname, dan kasir hijau **tanpa ubah asersi** (kecuali asersi volume milik task ini); bila tes lain mengunci angka seed, berhenti dan laporkan (ruling). Pemeriksaan wajib.
- [ ] **Step 5:** commit `feat(mock): state v9 — HPP per baris penjualan dan riwayat contoh 63 hari`.

---

### Task 9: Kontrak laporan, aturan periode, dan server palsu laporan penjualan

**Model:** Opus · **Gelombang:** 5 (paralel) · **Risk class:** risky (kontrak, laba, tanggal)

**Files:** Modify `api/openapi.yaml`; regenerate gen; Modify `web/src/shared/api/contract.test.ts`, `openapi-text.test.ts`, `web/src/shared/lib/money.ts` (+ `formatSignedRupiah`) + test; Create `web/src/shared/lib/report-period.ts` (+ test), `web/src/mocks/reports/sales-report.ts` (+ test), `web/src/mocks/handlers/owner-reports.ts` (+ test); Modify `web/src/mocks/handlers/index.ts`.

**Interfaces — Produces (kontrak; tag `owner`, `ownerCookieAuth`, 401; query `period` enum, `from`/`to` date wajib → 422 `VALIDATION` dengan pesan `checkRange`):**

| Method & path | operationId | Sukses |
|---|---|---|
| `GET /api/owner/reports/sales` | `getOwnerSalesReport` | 200 `SalesReport` |
| `GET /api/owner/reports/products` (+ `sort` enum `omzet\|jumlah\|laba`) | `listOwnerProductSales` | 200 `ProductSales[]` |
| `GET /api/owner/reports/stock` (+ `sort` enum `modal\|lama`, bawaan `modal` — label pemilik: urutan angka uang di server, bukan di komponen) | `getOwnerStockReport` | 200 `StockReport` |
| `GET /api/owner/reports/opname` (`from`, `to`) | `getOwnerOpnameReport` | 200 `OpnameReport` |
| `GET /api/owner/reports/opname/{productId}` (`from`, `to`) | `getOwnerOpnameProductReport` | 200 `OpnameProductReport`, 404 |

(pra-cek) Endpoint ekspor tidak masuk F3c-1.

```yaml
ReportPeriod: enum [hari, minggu, bulan, tanggal]
ReportRange: { from: date, to: date }
SalesTotals: { revenue, grossProfit, salesCount, avgTicket, newCredit, marginPermille: int? }   # aturan sama dengan OwnerTodaySummary; (jawaban pemilik Q5) marginPermille = tanda × roundHalfUp(|grossProfit| × 1000, revenue), null bila revenue 0
ReportBucket: { key: string, revenue: int?, grossProfit: int? }               # jam: "0".."23"; hari: YYYY-MM-DD; null = belum terjadi
ReportSeries: { kind: enum[jam, hari], buckets: ReportBucket[] }
ProductSales: { productId: string?, productName, unitName, unitSize: int, isCurah: bool, qtyBase: int, revenue: int, grossProfit: int? }
CategorySales: { category: string?, revenue, grossProfit, productCount: int }
KasirSales: { kasirName, revenue, salesCount, voidedCount }
SalesReport: { period: ReportPeriod, range: ReportRange, previous: ReportRange, running: bool, current: SalesTotals,
  previousTotals: SalesTotals, series: ReportSeries, topProducts: ProductSales[] (maks 3), categories: CategorySales[], kasir: KasirSales[] }
UnsoldItem: { productId, productName, unitName, unitSize, isCurah, stockQtyBase: int, lastSoldAt: int64?, sinceDate: date, days: int, heldValue: int? }
ThinMarginItem: { productId, productName, unitName, price: int, unitCost: int, marginPermille: int }
StockReport: { today: date, unsold: { minDays: int, count: int, heldValue: int, noCostCount: int, items: UnsoldItem[] },
  thinMargin: { thresholdPermille: int, count: int, items: ThinMarginItem[] } }
DutyEntry: { name, shifts: int, records: int }
OpnameCountRow: { sessionId, countedAt: int64, counterName, diffQtyBase: int, value: int?, reason: OpnameReason?,
  state: OpnameItemState, previousCountedAt: int64?, duty: DutyEntry[] }
OpnameReportItem: { productId, productName, unitName, unitSize, isCurah, countTotal: int, shortCount: int, overCount: int,
  repeated: bool, shortQtyBase: int, overQtyBase: int, lossValue: int?, gainValue: int? }
OpnameReport: { range, lossValue: int, lossCount: int, gainValue: int, gainCount: int, unknownValueCount: int, items: OpnameReportItem[] }
OpnameProductReport: allOf OpnameReportItem + { range, dutyOnShort: { name, intervals: int }[], counts: OpnameCountRow[] }
```
```ts
// shared/lib/report-period.ts — murni, dipakai mock & app pemilik
export type IsoRange = { from: string; to: string };
export const MAX_RANGE_DAYS = 92;
export function periodRange(period: "hari" | "minggu" | "bulan", anchor: string): IsoRange;
export function shiftPeriod(period: ReportPeriod, range: IsoRange, step: -1 | 1): IsoRange;
export function clampToToday(range: IsoRange, today: string): IsoRange & { running: boolean };
export function previousRange(period: ReportPeriod, range: IsoRange): IsoRange;     // K12 (range sesudah dijepit)
export function checkRange(period: ReportPeriod, from: string, to: string, today: string): string | null;
export function rangeLabel(range: IsoRange): string;
export function periodTitle(period: ReportPeriod, range: IsoRange): string;
export function compareText(current: number, previous: number, label: string, hasData: boolean, format: (n: number) => string): string;  // K13
// shared/lib/money.ts
export function formatSignedRupiah(n: number): string;   // "+Rp38.000" | "−Rp412.000" (U+2212) | "Rp0"
// mocks/reports/sales-report.ts
export function salesReport(state: Readonly<MockState>, q: { period: ReportPeriod; from: string; to: string }, now: number): SalesReport;
export function productSales(state: Readonly<MockState>, q: { period: ReportPeriod; from: string; to: string; sort: ProductSalesSort }, now: number): ProductSales[];
```
Handler `stock`, `opname`, `opname/{productId}` dibuat T10.

- [ ] **Step 1: Tulis test yang gagal**
```ts
// report-period.test.ts
test.each([
  ["minggu", "2026-11-05", "2026-11-02", "2026-11-08"], ["bulan", "2026-11-05", "2026-11-01", "2026-11-30"],
  ["bulan", "2028-02-10", "2028-02-01", "2028-02-29"], ["hari", "2026-11-05", "2026-11-05", "2026-11-05"],
  ["minggu", "2026-11-08", "2026-11-02", "2026-11-08"],   // (pra-cek) Minggu = hari terakhir minggu, bukan awal minggu berikutnya
])("periodRange(%s, %s)", (p, a, from, to) => expect(periodRange(p, a)).toEqual({ from, to }));
test.each([
  ["hari", "2026-11-05", "2026-11-05", "2026-10-29", "2026-10-29"],
  ["minggu", "2026-11-02", "2026-11-05", "2026-10-26", "2026-10-29"],
  ["bulan", "2026-11-01", "2026-11-05", "2026-10-01", "2026-10-05"],
  ["bulan", "2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"],
  ["bulan", "2026-11-01", "2026-11-30", "2026-10-01", "2026-10-31"],
  ["bulan", "2026-03-01", "2026-03-30", "2026-02-01", "2026-02-28"],
  ["bulan", "2028-03-01", "2028-03-30", "2028-02-01", "2028-02-29"],
  ["bulan", "2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"],
  ["bulan", "2026-05-01", "2026-05-31", "2026-04-01", "2026-04-30"],   // (jawaban pemilik Q7) 31 hari vs 30 hari
  ["bulan", "2026-05-01", "2026-05-30", "2026-04-01", "2026-04-30"],   // (jawaban pemilik Q7) berjalan 30 Mei: sejajar = 30 Apr = akhir April
  ["bulan", "2026-03-01", "2026-03-29", "2026-02-01", "2026-02-28"],   // (jawaban pemilik Q7) 29 Mar dijepit ke 28 Feb
  ["bulan", "2026-07-01", "2026-07-31", "2026-06-01", "2026-06-30"],
  ["bulan", "2026-12-01", "2026-12-31", "2026-11-01", "2026-11-30"],   // (pra-cek) lintas tahun di arah lain
  ["bulan", "2027-01-01", "2027-01-05", "2026-12-01", "2026-12-05"],   // (pra-cek) lintas tahun
  ["tanggal", "2026-10-10", "2026-10-16", "2026-10-03", "2026-10-09"],
])("previousRange %s %s..%s → %s..%s", (p, f, t, pf, pt) => expect(previousRange(p, { from: f, to: t })).toEqual({ from: pf, to: pt }));
test("shiftPeriod bulan dari 31 Mar → Februari penuh (bukan 3 Mar); minggu ±7; tanggal geser sepanjang rentang", …);   // (pra-cek)
test("clampToToday: 1–30 Nov pada 5 Nov → 1–5 Nov running", () =>
  expect(clampToToday({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-05")).toEqual({ from: "2026-11-01", to: "2026-11-05", running: true }));
test("label", () => {
  expect(rangeLabel({ from: "2026-11-05", to: "2026-11-05" })).toBe("5 Nov");
  expect(rangeLabel({ from: "2026-11-01", to: "2026-11-05" })).toBe("1–5 Nov");
  expect(rangeLabel({ from: "2026-10-28", to: "2026-11-03" })).toBe("28 Okt–3 Nov");
  expect(rangeLabel({ from: "2026-12-28", to: "2027-01-03" })).toBe("28 Des 2026–3 Jan 2027");
  expect(periodTitle("hari", { from: "2026-11-05", to: "2026-11-05" })).toBe("Kamis, 5 Nov 2026");
  expect(periodTitle("minggu", { from: "2026-11-02", to: "2026-11-08" })).toBe("2–8 Nov 2026");
  expect(periodTitle("bulan", { from: "2026-11-01", to: "2026-11-30" })).toBe("November 2026");
});
test("compareText", () => {
  expect(compareText(108, 100, "1–5 Okt", true, String)).toBe("▲ 8% dari 1–5 Okt");
  expect(compareText(92, 100, "1–5 Okt", true, String)).toBe("▼ 8% dari 1–5 Okt");
  expect(compareText(1004, 1000, "1–5 Okt", true, String)).toBe("Sama dengan 1–5 Okt");
  expect(compareText(5, 0, "1–5 Okt", false, String)).toBe("Belum ada data 1–5 Okt");
  expect(compareText(5000, 0, "1–5 Okt", true, formatRupiah)).toBe("Rp0 di 1–5 Okt");
  expect(compareText(5000, -2000, "1–5 Okt", true, formatSignedRupiah)).toBe("−Rp2.000 di 1–5 Okt");   // (pra-cek) laba minus
});
test.each([
  ["tanggal", "2026-08-01", "2026-11-05", "Rentang maksimal 92 hari"], ["tanggal", "2026-11-05", "2026-11-01", "Tanggal akhir sebelum tanggal awal"],
  ["hari", "2026-11-06", "2026-11-06", "Tanggal di masa depan"], ["minggu", "2026-11-03", "2026-11-08", "Periode tidak cocok"],
  ["bulan", "2026-11-01", "2026-11-30", null],   // (pra-cek) bulan berjalan penuh sah (dijepit, bukan ditolak)
])("checkRange %s %s..%s → %s", (p, f, t, msg) => expect(checkRange(p, f, t, "2026-11-05")).toBe(msg));
// sales-report.test.ts
test("Hari ini = Beranda: current = {revenue, grossProfit, salesCount, newCredit, avgTicket} ownerTodaySummary; previousTotals.revenue = lastWeekRevenue", …);
test("bulan berjalan 1–5 Nov 14.30: penjualan 5 Okt 14.30:59 masuk pembanding, 14.31:00 tidak", …);
test("(jawaban pemilik Q7) berjalan 30 Mar 14.30 → pembanding 1–28 Feb dengan 28 Feb PENUH (penjualan 28 Feb 20.00 ikut); berjalan 28 Mar 14.30 → 1–28 Feb dipotong 14.30 (sejajar)", …);
test("(jawaban pemilik Q5) marginPermille: omzet 48.215.500 laba 7.912.300 → 164; omzet 0 → null; laba minus → negatif", …);
test("batas WIB: 17.30 UTC 4 Nov (00.30 WIB) masuk 5 Nov; 16.59 UTC 4 Nov masuk 4 Nov", …);
test("dibatalkan 5 Nov untuk jualan 3 Nov → keluar dari omzet 1–5 Nov; Per kasir voidedCount +1 untuk kasir penjualnya", …);
test("seri bulan November: 30 bucket 2026-11-01..30, tanggal sesudah hari ini null; Hari: 24 bucket, jam sesudah sekarang null", …);
test("2 dus Indomie (isi 40) + 5 pcs → qtyBase 85; curah 1.500 gram → qtyBase 1500", …);
test("urut jumlah memakai qtyBase ÷ unitSize eceran; seri → omzet lebih besar dulu; laba null terakhir di urut laba", …);
test("HPP diubah setelah penjualan → grossProfit periode itu tidak berubah (lineCosts)", …);
test("barang dengan satu baris tanpa HPP → ProductSales.grossProfit null; total grossProfit memakai null = 0", …);
test("kategori null & barang terhapus → category null; topProducts maks. 3 urut omzet", …);
// owner-reports.test.ts
test("tanpa sesi pemilik → 401; period/rentang tidak sah → 422 dengan pesan checkRange; to > hari ini dijepit", …);
```
`contract.test.ts`: kelima operationId ada; `GetOwnerSalesReportQueryParams` menolak `period: "tahun"`; tidak ada path non-`/api/owner` yang merujuk skema laporan.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS + pemeriksaan wajib.
- [ ] **Step 5:** commit `feat(api): kontrak laporan pemilik` lalu `feat(mock): laporan penjualan dengan pembanding sepanjang rentang yang sama`.

---

### Task 10: Server palsu — laporan stok, untung tipis, dan selisih opname (pengaman 4)

**Model:** Opus · **Gelombang:** 6 (paralel) · **Risk class:** risky (stok, nilai, akurasi tuduhan)

**Files:** Create `web/src/mocks/reports/unsold.ts`, `thin-margin.ts`, `opname-report.ts`, `duty.ts`, `sample-opname.ts` (+ test masing-masing); Modify `web/src/mocks/handlers/owner-reports.ts` (+ test), `web/src/mocks/dev-panel.tsx` (+ test, tombol `Isi contoh opname`†).

**Interfaces — Consumes:** T8 `reportRules`, `catalogSince`; T2 `closedShifts.openedAt`; T9 skema; `unitCost`, `eceranOf`, `isoDaysBetween`, `jakartaIsoDate`, `MockOpnameSession`, `MockOpnameItem`, `stockEntries`, `receipts`, `expiryLog`. **Produces:**
```ts
export function unsoldReport(state: Readonly<MockState>, now: number, sort: "modal" | "lama"): StockReport["unsold"];     // K17; modal = heldValue desc, null terakhir; lama = days desc, seri → heldValue desc (label pemilik: urut di server)
export function thinMarginReport(state: Readonly<MockState>): StockReport["thinMargin"];          // K18
export function opnameReport(state: Readonly<MockState>, range: IsoRange): OpnameReport;           // K19
export function opnameProductReport(state: Readonly<MockState>, productId: string, range: IsoRange): OpnameProductReport | null;
export function dutyBetween(state: Readonly<MockState>, productId: string, from: number, to: number, excludeSessionId: string): DutyEntry[];  // K20, urut nama
export function applySampleOpname(state: MockState, now: number): void;   // Rokok Gudang Garam 12: 4 hitungan (3 kurang berurutan), Kecap: 1 lebih
```

- [ ] **Step 1: Tulis test yang gagal**
```ts
// unsold.test.ts (now = 5 Nov 2026 10.00 WIB)
test("terakhir terjual 4 Okt → 32 hari, tampil; 7 Okt → 29 hari, tidak", …);
test("tidak pernah terjual, stok pertama 1 Okt → 'belum terjual' 35 hari; stok pertama 20 Okt (baru) → tidak ikut", …);
test.each(["nonaktif", "menunggu_harga"])("status %s tidak ikut", …);
test("stok 0 dan stok −3 tidak ikut; penjualan dibatalkan tidak dihitung sebagai terjual", …);
test("heldValue = unitCost(HPP, stok): HPP {104000, 40}, stok 18 → 46.800; tanpa HPP → null, noCostCount +1, tidak dijumlah", …);
// thin-margin.test.ts — harga eceran 10.000
test.each([[9_100, true, 90], [9_000, false, 100], [9_001, true, 100], [10_500, true, -50]])("modal %i → tipis %s, permil %i", …);
test("tanpa HPP / nonaktif / menunggu harga tidak ikut; urut permil naik (rugi dulu); HPP per eceran memakai unitSize eceran", …);
// opname-report.test.ts (applySampleOpname)
test("kartu: Kurang = Σ nilai kurang, Lebih = Σ nilai lebih, jumlah barang berbeda", …);
test("Rokok: 4 hitungan, kurang 3 berurutan → repeated; −14 bks; nilai kurang −294.000", …);
test("ditahan, menunggu_alasan, diganti tidak ikut; dihitung_ulang memakai recount; stok_awal hanya patokan", …);
test("hitungan tanpa HPP: lossValue null tidak dijumlah, unknownValueCount +1", …);
// duty.test.ts
test("shift yang tumpang dengan jeda (closedShifts + shift buka) dihitung; shift di luar jeda tidak", …);
test("orang toko: nota barang masuk berisi barang itu, keluarkan kedaluwarsa, sesi opname lain → records; sesi hitungan ini sendiri tidak", …);
test("Rina kasir sekaligus pencatat → satu entri {Rina, shifts, records}; daftar urut nama (Dedi sebelum Rina)", …);
test("jeda mulai dari hitungan sebelum periode; hitungan pertama → previousCountedAt null, duty []", …);
test("dutyOnShort: Rina 3 dari 3, Dedi 1 dari 3, urut nama", …);
// owner-reports.test.ts — GET stock/opname/opname/{id}: 401, 404 barang tanpa hitungan, 422 rentang
// dev-panel.test.tsx — 'Isi contoh opname' memanggil applySampleOpname; dua kali tidak menggandakan
```
- [ ] **Step 2:** FAIL. **Step 3:** implementasi + handler + tombol dev. **Step 4:** PASS + pemeriksaan wajib.
- [ ] **Step 5:** commit `feat(mock): laporan tidak terjual, untung tipis, dan selisih opname dengan yang bertugas`.

---

### Task 11: Laporan halaman utama + grafik Health bersama Beranda (pra-cek)

**Model:** Opus · **Gelombang:** 6 (paralel dengan T10) · **Risk class:** risky (komponen bersama layar jadi)

**Files:** Create `web/src/features/owner/common/health-chart/health-chart.tsx`, `health-chart-geometry.ts`, `health-chart-parts.tsx` (+ `health-chart.test.tsx`, `health-chart-geometry.test.ts`); Modify `web/src/features/owner/home/hourly-chart.tsx`, `hourly-chart-geometry.ts`, `hourly-chart-parts.tsx` (adaptor), `web/src/app/styles.css` (`--color-chart-3`) + penjaga palet; Create `web/src/features/owner/laporan/laporan-page.tsx` (+ test), `period-bar.tsx` (+ test), `date-range-sheet.tsx`, `revenue-card.tsx`, `report-tiles.tsx`, `report-search.ts` (+ test), `report-rows.tsx`, dan **(pra-cek) tujuh file placeholder di jalur akhirnya** `top-products-page.tsx`, `categories-page.tsx`, `report-kasir-page.tsx`, `unsold-page.tsx`, `thin-margin-page.tsx`, `opname-report-page.tsx`, `opname-product-page.tsx` (masing-masing `Segera hadir`); Modify `web/src/app/owner-routes.tsx` (search `laporan` + 7 sub-rute), `web/src/features/owner/index.ts` (ekspor 7 komponen dari file masing-masing), `web/src/features/owner/pages.tsx` (hapus `LaporanPage`; file dihapus bila kosong), `web/src/features/owner/common/sub-page-header.tsx` (`"/owner/laporan"`, `"/owner/laporan/selisih-opname"`).

**Interfaces — Consumes:** gen `useGetOwnerSalesReport`, `useGetOwnerStockReport`, `useGetOwnerOpnameReport`, `SalesReport`; T9 `report-period.ts`, `formatSignedRupiah`; `FitAmount`, `Section`, `RowList`, `formatRupiah`, `formatRupiahShort`, `hourWindow` (adaptor dari `ReportBucket` → `HourBucket`), `useBusinessDay`. **Produces:**
```ts
export type HealthBucket = { key: string; label: string; tick: boolean; back: number | null; front: number | null };
export type HealthSeries = { name: string; color: string; nowColor?: string };
export function HealthChart(props: { buckets: HealthBucket[]; back: HealthSeries; front: HealthSeries;
  emphasis: "back" | "front"; nowKey: string | null; groupLabel: string; caption: string; keyHeader: string;
  summary: string; peakLabel: (value: number) => string }): JSX.Element;
export type ReportSearch = { periode: ReportPeriod; dari: string; sampai: string };
export function validateReportSearch(search: Record<string, unknown>, today: string): ReportSearch;   // tidak sah → bulan berjalan (K26)
```
**(pra-cek) Adaptor Beranda:** ekspor yang dipakai tes (`HourlyChart`, `buildChart`, `peakSummary`, `HOUR_LABEL_HALF`, `PEAK_CHAR_WIDTH`) tetap ada dengan tanda tangan & keluaran sama (boleh membungkus geometri `HealthChart`); ekspor lain (`CHART_HEIGHT`, `hourLabel`, `ChartRow`, `TODAY_NAME`, `Legend`, `Tooltip`, `describeRow`, `DataTable`) boleh pindah/hapus bila tidak dipakai lagi — `knip` menolak ekspor yang tak terpakai.

Laporan: segmen periode; navigator ‹ › (44 px); Tanggal → `DateRangeSheet` (`checkRange`); kartu C4 (`Omzet {rangeLabel}`, pil `compareText(current.revenue, previousTotals.revenue, label, previousTotals.salesCount > 0, formatRupiah)`); `HealthChart` (back = omzet `--color-chart-1`/`-now`, front = laba `--color-chart-3`); 4 kartu angka dengan pembanding (Laba kotor memakai `formatSignedRupiah`; (jawaban pemilik Q5) label `Laba kotor · {marginPermille/10 satu desimal}%`, null → `Laba kotor`); `Paling laku` 3 teratas + `Lihat semua`; `Tidak terjual ≥ 30 hari`; baris `Per kategori`, `Per kasir`, `Selisih opname`, `Untung tipis` (tautan membawa search). Bila `size:check` `owner-` > 50 KB → K23.

- [ ] **Step 1: Tulis test yang gagal**
  - `hourly-chart.test.tsx`, `hourly-chart-geometry.test.ts`, `beranda-page.test.tsx`, `home-model.test.ts`, `owner-layout.test.tsx` **tidak diubah** dan hijau setelah refactor.
  - `health-chart.test.tsx`: legenda `Omzet` & `Laba kotor`; grup `Omzet dan laba kotor per hari, 1–5 Nov` bisa difokus; → memindah aktif dan live region `4 Nov, Omzet Rp…, Laba kotor Rp…`; tabel sr-only; bucket null tanpa batang; laba negatif → tinggi 0, tabel `−Rp…`; slot bulan 30 dengan label 1, 8, 15, 22, 29; bulan 31 hari & Februari 28 hari.
  - `report-search.test.ts`: kosong → `{bulan, 2026-11-01, 2026-11-30}`; `periode=minggu&dari=2026-11-03` → bulan berjalan.
  - `laporan-page.test.tsx` (MSW, jam dipatok Kamis 5 Nov 2026 14.30; **(pra-cek) `stock` & `opname` lewat `server.use(...)` dengan fixture bertipe gen**, karena handler-nya dibuat T10 di gelombang yang sama): `Bulan` terpilih; `November 2026`; pita `Omzet 1–5 Nov` + pil `… dari 1–5 Okt`; empat kartu masing-masing punya baris pembanding; label `Laba kotor · 16,4%` (fixture marginPermille 164), omzet 0 → `Laba kotor`; `Periode berikutnya` nonaktif; `Periode sebelumnya` → `Oktober 2026`, pita `Omzet 1–31 Okt`, pil `… dari 1–30 Sep`; `Hari` → `Omzet & laba kotor per jam` (jawaban pemilik Q6: dua seri omzet & laba, bukan minggu lalu) dan pil `… dari Kamis, 29 Okt`; `Tanggal` → lembar, 93 hari → `Rentang maksimal 92 hari`; `Paling laku` 3 baris + `Lihat semua` → `/owner/laporan/paling-laku?periode=bulan&…`; baris stok/opname dari fixture; Hari ini mode Hari = angka Beranda; galat → `pesanError` + `Coba lagi`; memuat → kerangka.
- [ ] **Step 2:** FAIL. **Step 3:** refactor grafik dulu (tes Beranda hijau), lalu Laporan. **Step 4:** PASS + pemeriksaan wajib; palet dicek validator dataviz (kontras `chart-3` vs `chart-1` dan vs putih); tangkapan 360 & 1280 + daftar periksa; ukuran `owner-` & total dicatat.
- [ ] **Step 5:** commit `refactor(owner): grafik Health dua seri dipakai bersama` lalu `feat(owner): laporan — periode, pembanding, grafik omzet & laba kotor`.

---

### Task 12: Laporan — Paling laku, Per kategori, Per kasir

**Model:** Sonnet · **Gelombang:** 7 (paralel) · **Risk class:** UI angka keputusan (review penuh, tanpa re-review — keputusan pemilik)

**Files:** Modify (isi placeholder T11) `web/src/features/owner/laporan/top-products-page.tsx` (+ test), `categories-page.tsx` (+ test), `report-kasir-page.tsx` (+ test). **(pra-cek) Tidak menyentuh `index.ts`/`pages.tsx`** (paralel aman dengan T13).

**Interfaces — Consumes:** gen `useListOwnerProductSales`, `useGetOwnerSalesReport`, `ProductSales`, `ProductSalesSort`; T11 `validateReportSearch`, `SubPageHeader` (eyebrow = `rangeLabel`); `formatQty`, `formatRupiah`. **Produces:** `TopProductsPage`, `CategoriesPage`, `ReportKasirPage`.

- [ ] **Step 1: Tulis test yang gagal** — Paling laku: `Omzet` terpilih, urutan mengikuti `sort=omzet`; `Jumlah` → request `sort=jumlah`, kanan `310 pcs` / `288 kg` dengan omzet di bawah; urutan Minyak (310 pcs) sebelum Gula (288 kg) sebelum Beras (142 karung); `Laba` → `HPP belum ada` di akhir; peringkat 1..n; kembali `‹ Laporan` mempertahankan search; Per kategori: urut omzet, `Tanpa kategori`, `{n} barang · laba Rp…`; Per kasir: `Rina` / `702 transaksi · 2 dibatalkan` kanan `Rp…`; kosong → `Belum ada penjualan`; galat → `pesanError`.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS + pemeriksaan wajib; tangkapan 360 & 1280 + daftar periksa.
- [ ] **Step 5:** commit `feat(owner): laporan paling laku, per kategori, dan per kasir`.

---

### Task 13: Laporan — Tidak terjual, Untung tipis, Selisih opname + detail

**Model:** Sonnet · **Gelombang:** 7 (paralel) · **Risk class:** UI angka keputusan (review penuh, tanpa re-review — keputusan pemilik)

**Files:** Modify (isi placeholder T11) `web/src/features/owner/laporan/unsold-page.tsx` (+ test), `thin-margin-page.tsx` (+ test), `opname-report-page.tsx` (+ test), `opname-product-page.tsx` (+ test); Create `duty-line.tsx`. Tidak menyentuh `index.ts`/`pages.tsx`.

**Interfaces — Consumes:** gen `useGetOwnerStockReport`, `useGetOwnerOpnameReport`, `useGetOwnerOpnameProductReport`; `OPNAME_REASON_LABEL`, `formatQty`, `formatSignedRupiah`, `formatRupiah`, `jakartaTime`, `formatIsoDayMonth`. **Produces:** `UnsoldPage`, `ThinMarginPage`, `OpnameReportPage`, `OpnameProductPage`; `dutyLineText(prevCountedAt: number | null, duty: DutyEntry[]): string`.

- [ ] **Step 1: Tulis test yang gagal** — Tidak terjual: kartu `Modal tertahan Rp…` / `{n} barang` + `2 barang belum ada HPP` (ikon + teks); `Modal terbesar` (HPP belum ada terakhir) ↔ `Paling lama` → request `sort=modal` / `sort=lama`, komponen menampilkan urutan server apa adanya (tanpa sort/filter angka di klien — rubrik R-UANG-UI); `74 hari · stok 18 pcs` dan `belum terjual · 52 hari`; Untung tipis: lead `Margin di bawah 10% dari harga eceran`; tanda `8,3%` warn + ikon; `−2,1%` di atas; `Modal Rp9.170 · harga Rp10.000 per pcs`; Selisih opname: `Kurang −Rp412.000` / `9 barang`, `Lebih +Rp38.000`; `Berulang` + `3 dari 4`; `kurang di 1 dari 2 · −2 pcs`; catatan `Selisih yang sudah diberi alasan tetap dihitung.`; detail: `Bertugas saat kurang` urut nama, `Petunjuk, bukan bukti — cocokkan dengan CCTV atau catatan laci.`; hitungan `Rab, 4 Nov · 10.05` / `−6 bks · dihitung Dedi · Hilang`; kotak `Sejak hitungan 31 Okt: Dedi 1 shift · Rina 4 shift, 2 catatan`; `dutyLineText(null, [])` = `Hitungan pertama`; kosong & galat masing-masing.
- [ ] **Step 2:** FAIL. **Step 3:** implementasi. **Step 4:** PASS + pemeriksaan wajib; tangkapan 360 & 1280 + daftar periksa.
- [ ] **Step 5:** commit `feat(owner): laporan tidak terjual, untung tipis, dan selisih opname dengan yang bertugas`.

---

### ~~Task 14: Ekspor Excel dan Simpan PDF~~ → F3c-2 (pra-cek)

Dipindah utuh (kontrak `exportOwnerReport`, xlsx tiruan, `downloadReport`, `ExportSection`, gaya cetak `print:hidden` di `owner-layout.tsx`/`page-header.tsx`) — lihat Catatan untuk F3c-2. Catatan untuk task itu nanti: `downloadReport` melewati `customFetch`, jadi 401 harus memicu penanganan sesi pemilik yang sama (gate) — bukan hanya `ApiError`.

---

### Task 15: E2E kasbon, pelunasan, kasir tanpa PIN, laporan, dan pemeriksaan akhir (pra-cek, ruling R12, jawaban pemilik)

**Model:** Sonnet · **Gelombang:** 8 (sendiri) · **Risk class:** E2E (review penuh)

**Files:** Create `web/e2e/kasbon.spec.ts`, `web/e2e/laporan.spec.ts` (helper `kasir-helpers.ts`, `owner-helpers.ts`).

- [ ] **Step 1: Tulis skenario**
  1. **Pelunasan tunai + tutup shift:** Rina buka shift modal 200.000 → `Pelunasan kasbon` → Bu Sari → nominal 50.000, uang diterima 100.000 → `KEMBALIAN Rp50.000` → `Simpan pelunasan` → `Pelunasan tersimpan`, `Sisa kasbon Rp70.000` → `Tutup` → `Tutup shift` uang fisik 250.000 → `Pelunasan kasbon` `+Rp50.000`, `Uang seharusnya Rp250.000`, selisih `Rp0`.
  2. **Keranjang berisi:** scan satu barang → `Pelunasan kasbon` QRIS 20.000 → `Sudah masuk` → `Tutup` → keranjang masih 1 baris.
  3. **Batal di kasir (R2):** pelunasan QRIS → Riwayat → `Batalkan pelunasan Bu Sari {HH.MM}` → alasan → `Dibatalkan`; pemilik (tab kedua) `Kasbon` → Bu Sari → `Dibatalkan` + alasan + `Rina`; Beranda butir `1 pelunasan dibatalkan kasir` → tinjau → `Tandai sudah ditinjau` → butir hilang.
  4. **Batal transaksi & lewat limit (R3/R4):** transaksi tunai → Riwayat → `Batalkan` → alasan → `Dibatalkan`; kasbon Pak Joko melewati limit → dialog `Kasbon melewati limit` → alasan → tersimpan; tutup shift; pemilik: Lainnya > `Transaksi` → transaksi shift tutup → `Batalkan transaksi` → alasan → `Dibatalkan`; Beranda butir batal transaksi & kasbon lewat limit dengan rentang tanggal.
  4b. **(ruling R12) Pengembalian keesokan hari:** shift A: jual tunai 50.000 → tutup shift; shift B (Budi) buka → Riwayat tidak memuat transaksi A (J0) → `Cari nomor struk` nomor itu → `Batalkan` → alasan → `Dibatalkan` → tutup shift B: baris `Pengembalian transaksi lama` `-Rp50.000`, `Uang seharusnya` turun 50.000.
  5. **Pelunasan langsung pemilik:** `Kasbon` → Bu Tini → `Catat pelunasan` `Transfer` 100.000 → saldo turun; kasir tutup shift **tanpa** baris `Pelunasan kasbon`.
  6. **Laporan:** `/owner/laporan` → `Bulan`, pita `Omzet 1–{d} {Mmm}` + pil, empat kartu dengan pembanding; `Periode sebelumnya` → bulan lalu; `Lihat semua` → `Jumlah` → urutan berubah; `Per kasir` Rina & Budi; `Tidak terjual ≥ 30 hari` memuat barang lambat; panel pengembang `Isi contoh opname` → `Selisih opname` → `Rokok Gudang Garam 12` → `Bertugas saat kurang` + `Petunjuk, bukan bukti — …`.
  7. **Beranda tidak berubah:** grup `/Omzet per jam hari ini dan .+ lalu/` dan tabel sr-only tetap (`owner-flows.spec.ts` lama hijau tanpa ubah).
  8. axe tanpa pelanggaran serius di `/owner/kasbon`, detail pelanggan, halaman tinjau, Transaksi + detail, `/owner/laporan` + 7 sub-halaman pada 360 px, dan lembar `Pelunasan kasbon` + dialog alasan pada 1366×768; larangan request ke luar tetap.
- [ ] **Step 2:** `npm run e2e` → skenario baru gagal sebelum perbaikan kecil, lalu hijau.
- [ ] **Step 3:** seluruh pemeriksaan wajib hijau; catat ukuran `owner-`, `kasir-`, `problem-`, (`laporan-` bila ada), total di ledger.
- [ ] **Step 4:** commit `test(e2e): pelunasan kasbon dua jalur, kasir tanpa PIN, dan laporan pemilik`.

---

## Catatan untuk F3c-2

- **(pra-cek) Ekspor (eks-T14, P12):** kontrak `GET /api/owner/reports/export` (xlsx, `Content-Disposition: attachment; filename="laporan-{from}-{to}.xlsx"`, sheet Go: Ringkasan, Per hari, Paling laku, Per kategori, Per kasir, Selisih opname, Tidak terjual, Untung tipis); mock zip simpan-saja `Ringkasan` diverifikasi `read-xlsx`; `downloadReport` (fetch + blob, 401 → penanganan sesi pemilik seperti `customFetch`); `ExportSection` di Laporan (`Unduh Excel`, `Simpan PDF` = `window.print()`); gaya cetak (`print:hidden` tab bar/pil/bar kaca, `@media print`); cek di HP asli/PWA. Kriteria: K-KONTRAK, K-BERSAMA → Opus + re-review.
- **(ruling R10) Harga jual sementara dari orang toko:** isian opsional `Harga jual (eceran)` di form staf nota untuk barang baru/`menunggu_harga`; diisi → aktif + tanda "harga dari orang toko"; validasi ≥ modal per eceran nota itu (422 `Harga jual di bawah modal`); hanya eceran; Perlu perhatian `{n} barang pakai harga dari orang toko` menumpuk sampai ditinjau (pola K29); tercatat di riwayat harga; respons staf tetap allowlist. **Dokumen: perbarui spec §12e** (aturan `menunggu_harga` F3b-2a) dan carry-over Go. Kriteria: K-UANG, K-KONTRAK, K-AKSES → Opus + re-review.
- **(ruling R11) "Ragu? Telepon pemilik: {nomor}"** di dialog alasan (batal transaksi, batal pelunasan, kasbon lewat limit, harga dari orang toko) setelah Pengaturan toko punya nomor pemilik; kosong → tidak tampil.
- **(ruling R9) Log aktivitas:** minimal 90 hari + paginasi; sumber: `voided*` penjualan, `cancelled*` pelunasan, `creditOverLimit`, perubahan limit (catat pelaku & jam saat dibuat di F3c-2), tinjau pengecualian. (cek ulang) Mockup `docs/specs/assets/2026-11-02-log-aktivitas.html` masih menulis "disetujui PIN pemilik" — ganti ke pola alasan (R1/R5) sebelum dipakai.
- **(cek ulang) Go — serialisasi:** void/batal pelunasan kasir dan tutup shift dikunci pada baris shift yang sama (mis. `SELECT … FOR UPDATE`), agar batal yang datang bersamaan dengan tutup shift masuk ke closure atau ditolak `SHIFT_CLOSED`/`OUTSIDE_SHIFT` — tidak pernah mengoreksi shift yang sudah tutup. (ruling R12) Baris `sale_refunds` juga ditulis di bawah kunci shift buka yang sama.
- **Shift & kas:** total QRIS shift = QRIS penjualan + QRIS pelunasan (`creditPayments` dengan `shiftId` itu, `method: qris`, tidak dibatalkan); tampilkan `creditPayments` tunai di rincian shift pemilik; daftar transaksi per shift dapat memakai ulang halaman Transaksi T7b.
- **Pengaturan:** `reportRules.thinMarginPermille` (+ pratinjau `Dengan batas {x}%: {n} dari {total} barang tertandai`), `unsoldDays`, limit kasbon bawaan pelanggan baru (500.000), nomor telepon pemilik (R11), J8 F3b-2b.
- **Pengaman 5:** cek acak mingguan; label `Pemilik · cek acak` di detail selisih opname.
- **Go (carry-over baru):** pelunasan idempoten per `(created_by, id)`; laci hanya kasir + tunai; **pembagian pembatal** (kasir: pelunasan hanya shift buka → `OUTSIDE_SHIFT`; transaksi shift buka, atau (ruling R12) shift tutup ≤ 7 hari kalender WIB dengan bagian tunai keluar dari laci shift buka (`sale_refunds`, `expected_cash − sale_refunds`) → lebih tua `VOID_TOO_OLD`; pemilik hanya shift tutup/jalur pemilik → `IN_OPEN_SHIFT`; pemilik tidak pernah mengoreksi laci); (jawaban pemilik J0) Riwayat kasir per shift buka (`GET /api/sales/shift`, `/api/credit-payments/shift`); (jawaban pemilik Q8) saldo kasbon boleh minus setelah void, umur & overdue hanya saldo > 0; `oldestUnpaidAt` FIFO sadar pembalik; `ageDays` dibulatkan ke atas; `sales.shift_id` wajib; void menyimpan `voided_at` (jam server), `voided_by` (id + nama), `void_reason`, `void_channel`; kasbon lewat limit dengan alasan menyimpan `credit_over_limit_excess` + alasan; **tidak ada PIN pemilik di endpoint kasir** (aturan carry-over lama "Owner-PIN attempts on void/credit are not rate-limited" & "ownerPin null 401 vs 403" usang); pengecualian & penanda tinjau per jenis dengan `upTo` monoton; HPP per baris `sale_items.cost`; laporan membaca status sekarang; pembanding K12; tidak terjual pakai `products.created_at` asli; bertugas K20 butuh `shift.opened_at` & catatan per barang. Tetap terbuka: void penjualan shift tutup oleh pemilik tidak mengoreksi `cash_sales` shift itu (uang dari pemilik) — dokumentasikan di laporan shift F3c-2; laporan shift F3c-2 juga menampilkan `saleRefunds` (ruling R12).

## Setelah semua task

1. Review akhir seluruh cabang (Opus) dengan perhatian ekstra pada Review Focus 1–7, allowlist respons kasir, Beranda tanpa regresi, tes yang berubah karena ruling (daftar T2b), dan tangkapan layar 360/1280.
2. Fix wave (Opus; A main tree ∥ B worktree bila file tidak tumpang), re-review perbaikan berisiko.
3. Perbarui memori (`kasir-sembako-project`, `kasir-sembako-carryover`: aturan Go di atas, hapus aturan PIN usang, ukuran bundle, sisa `Section` pindah ke `owner/common`), ff-merge lokal ke `main`; pemilik yang push.

## Pertanyaan untuk pemilik (jawaban pemilik)

Semua pertanyaan Q1–Q8 sudah dijawab pemilik 5 Nov 2026 (lihat bagian "Jawaban pemilik atas pertanyaan rencana + ruling R12"). Tidak ada pertanyaan terbuka. Keputusan pembangun baru yang boleh dikoreksi pemilik: batas 7 hari R12 = hari kalender WIB (struk tanggal 29 Okt masih boleh sampai 5 Nov 23.59); kasbon lewat 7 hari & pembatalan tanpa shift buka ditolak di kasir; teks `Riwayat shift ini` dan `Pengembalian transaksi lama` (†); potongan menit pembanding tidak berlaku saat tanggal sejajar dijepit (Q7).

Perbedaan kecil rencana vs mockup yang dipilih tanpa ditanyakan (tampil di laporan T0): tombol Riwayat tetap `Cetak ulang` (mockup `Cetak`) agar sama dengan baris transaksi; layar hasil `Pelunasan tersimpan` ditambahkan (mockup tidak punya); dialog batal pelunasan kasir tidak menulis sisa hasil (kasir tidak memegang saldo terkini); tanda `Melebihi limit` di daftar Kasbon dihapus (tidak ada di mockup; tercakup butir kasbon lewat limit).
