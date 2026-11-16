import { expect, test } from "vitest";
import spec from "../../../../api/openapi.yaml?raw";

const LINES = spec.split(/\r?\n/);

/** Blok YAML yang dimulai `header` pada indentasi `indent` sampai saudara berikutnya. */
function block(from: readonly string[], header: string, indent: number) {
  const pad = " ".repeat(indent);
  const start = from.indexOf(`${pad}${header}:`);
  if (start < 0) throw new Error(`tidak ada ${header}`);
  const sibling = new RegExp(`^ {0,${indent}}\\S`);
  const rest = from.slice(start + 1);
  const end = rest.findIndex((l) => sibling.test(l));
  return [from[start] ?? "", ...(end < 0 ? rest : rest.slice(0, end))];
}

const op = (path: string, method: string) =>
  block(block(LINES, path, 2), method, 4).join("\n");
const schema = (name: string) =>
  block(block(LINES, "schemas", 2), name, 4).join("\n");
const field = (name: string, prop: string) =>
  block(block(block(LINES, "schemas", 2), name, 4), prop, 8).join("\n");
// Teks deskripsi dilipat ke satu baris agar kalimat yang terpotong baris tetap cocok.
const prose = (text: string) => text.replace(/\s+/g, " ");

const STAFF_OPS = LINES.flatMap((line, i) => {
  const path = /^ {2}(\/api\/staff\/\S+):$/.exec(line)?.[1];
  if (path === undefined) return [];
  return block(LINES.slice(i), path, 2)
    .flatMap((l) => /^ {4}(get|post|put|delete):$/.exec(l)?.[1] ?? [])
    .map((method) => ({ path, method, text: op(path, method) }));
});

test("semua operasi /api/staff: tag staff, 403 LanOnly; 401 bila ber-security", () => {
  expect(STAFF_OPS).toHaveLength(23);
  const publicOps = [
    "/api/staff/users",
    "/api/staff/login",
    "/api/staff/logout",
  ];
  for (const { path, method, text } of STAFF_OPS) {
    const where = `${method} ${path}`;
    expect(text, where).toContain("tags: [staff]");
    expect(text, where).toMatch(
      /"403":\n\s+\$ref: "#\/components\/responses\/LanOnly"/,
    );
    const secured = text.includes("security:");
    expect(secured, where).toBe(!publicOps.includes(path));
    if (secured) {
      expect(text, where).toContain("- staffCookieAuth: []");
      expect(text, where).toContain('"401":');
    }
  }
});

test("R9: kunci PIN orang toko terpisah dari login kasir", () => {
  const login = prose(op("/api/staff/login", "post"));
  expect(login).toContain(
    "Hitungan PIN salah dan kunci realm orang toko terpisah dari login kasir; gagal di HP tidak mengunci PC kasir, dan sebaliknya.",
  );
  expect(login).not.toContain("dibagi");
});

test("staffLogout tanpa security, selalu 204", () => {
  const logout = op("/api/staff/logout", "post");
  expect(logout).not.toContain("security:");
  expect(logout).toContain('"204":');
});

test("R7: idempotensi nota per (pembuat, id); nota orang lain tidak pernah dikembalikan", () => {
  const create = prose(op("/api/staff/receipts", "post"));
  expect(create).toContain("(pembuat, id)");
  expect(create).toContain('"409":');
  expect(create).toContain("id sudah dipakai pengguna lain");
  expect(create).toContain(
    "nota milik pengguna lain tidak pernah dikembalikan",
  );
});

test("R8: laci tanpa shift buka → 422 field cashSource, tidak diubah jadi uang pemilik", () => {
  const rule =
    "cashSource laci tanpa shift kasir yang buka → 422 dengan field cashSource; server tidak pernah mengubahnya menjadi uang pemilik";
  expect(prose(schema("ReceiptPayment"))).toContain(rule);
  expect(prose(op("/api/staff/receipts", "post"))).toContain(rule);
});

test("R6: ubah/batal nota setelah shift ditutup → koreksi di shift yang sedang buka", () => {
  const rule =
    "Boleh setelah shift saat nota dicatat ditutup; koreksi uang laci dicatat sebagai baris uang keluar baru di shift yang sedang buka";
  expect(prose(op("/api/staff/receipts/{receiptId}", "put"))).toContain(rule);
  expect(prose(op("/api/owner/receipts/{receiptId}/cancel", "post"))).toContain(
    rule,
  );
});

test("foto nota terikat ke pengunggah", () => {
  const put = prose(op("/api/staff/receipt-photos/{photoId}", "put"));
  expect(put).toContain('"409":');
  expect(put).toContain("pengguna lain → 409 ID_TAKEN, tidak pernah ditimpa");
  const get = prose(op("/api/staff/receipt-photos/{photoId}", "get"));
  expect(get).toContain("Foto yang bukan diunggah pengguna ini juga 404.");
  expect(prose(schema("ReceiptInput"))).toContain(
    "harus diunggah oleh pengguna ini; selain itu 422 dengan field photoId",
  );
});

test("hitung buta: daftar barang opname dan respons sebelum kirim tanpa stok (K8)", () => {
  const products = prose(op("/api/staff/opname/products", "get"));
  expect(products).toContain(
    "Hitung buta: tanpa stok, harga jual, atau modal.",
  );
  expect(products).toContain(
    "kategori wajib bila lingkup = kategori dan dilarang untuk lingkup lain → 422 VALIDATION",
  );
  expect(prose(op("/api/staff/opname/categories", "get"))).toContain(
    "Hitung buta: tanpa stok.",
  );
  expect(prose(schema("StaffOpnameItem"))).toContain(
    "systemQtyBase baru dikirim setelah hitungan diterima server",
  );
});

test("K2/K5/K6: kirim hitungan idempoten, siapa menang, jam hitung digeser jam HP", () => {
  const create = prose(op("/api/staff/opname-sessions", "post"));
  expect(create).toContain("Idempoten menurut (pembuat, id)");
  expect(create).toContain("id sudah dipakai pengguna lain → 409 ID_TAKEN");
  expect(create).toContain(
    "cocok dan stok_awal langsung diterapkan ke stok tanpa alasan",
  );
  expect(create).toContain(
    "hanya hitungan dengan countedAt terbaru yang berlaku",
  );
  expect(create).toContain("at = countedAt + (serverNow − deviceNow)");
  expect(create).toContain("Atomik: 422 OpnameProblem");
  const finish = prose(
    op("/api/staff/opname-sessions/{sessionId}/finish", "post"),
  );
  expect(finish).toContain("Replay pada sesi selesai → 200 sesi apa adanya");
  expect(finish).toContain("> Rp100.000");
});

test("J6/K9: kedaluwarsa FIFO per kiriman, urutan lots, log 14 hari", () => {
  const expiry = prose(op("/api/staff/expiry", "get"));
  expect(expiry).toContain("lewat dulu lalu segera, masing-masing ED naik");
  expect(expiry).toContain("14 hari terakhir, terbaru dulu, paling banyak 20");
  const removal = prose(op("/api/staff/expiry-removals", "post"));
  expect(removal).toContain("dicatat pada kiriman (baris nota) yang dipilih");
  expect(removal).toContain("1 ≤ qtyBase ≤ capacityQtyBase");
  expect(removal).toContain("Idempoten menurut id saja, bukan per pembuat");
  expect(removal).not.toContain("dicatat pengguna ini");
  const ownerRemoval = prose(op("/api/owner/expiry-removals", "post"));
  expect(ownerRemoval).toContain("idempoten menurut id saja");
  expect(ownerRemoval).not.toContain("dicatat pengguna ini");
});

test("teks kontrak untuk Go: StockMovement.at, tinjau sesi, pengaman selisih tertahan (I2)", () => {
  expect(prose(schema("StockMovement"))).toContain(
    "Waktu dicatat di server (epoch ms UTC), untuk semua jenis termasuk opname dan stok_awal.",
  );
  expect(prose(schema("StockMovement"))).toContain("tidak diekspos");
  const review = prose(
    op("/api/owner/opname-sessions/{sessionId}/review", "post"),
  );
  expect(review).toContain("Boleh untuk sesi apa pun");
  expect(review).toContain("Idempoten");
  expect(review).toContain("Attention.opnameReplacedHeld");
  const create = prose(op("/api/staff/opname-sessions", "post"));
  expect(create).toContain(
    "hitungan baru tetap menunggu pemilik apa pun angkanya",
  );
  const finish = prose(
    op("/api/staff/opname-sessions/{sessionId}/finish", "post"),
  );
  expect(finish).toContain(
    "server menerima nota aktif mana pun yang memuat barang itu",
  );
  expect(finish).toContain('("Barang dihitung dua kali")');
});

test("menipis staf tanpa angka stok (J7)", () => {
  expect(prose(op("/api/staff/low-stock", "get"))).toContain(
    "Tanpa angka sisa stok.",
  );
});

test("K2/K3/K4: pelunasan kasir — laci, jumlah, idempoten", () => {
  const create = prose(op("/api/credit-payments", "post"));
  expect(create).toContain("tidak pernah masuk laci");
  expect(create).toContain("maksimal sisa kasbon");
  expect(create).toContain("id yang sama");
});

test("K5 (ruling R2): batal pelunasan kasir vs pemilik", () => {
  expect(
    prose(op("/api/credit-payments/{paymentId}/cancel", "post")),
  ).toContain("shift yang sedang buka");
  expect(
    prose(op("/api/owner/credit-payments/{paymentId}/cancel", "post")),
  ).toContain("laci tidak dikoreksi");
});

test("ShiftClosure.saleRefunds memuat rumus uang seharusnya lengkap (ruling R12)", () => {
  const formula =
    "expectedCash = openingCash + cashSales − supplierPayments + creditPayments − saleRefunds";
  expect(prose(field("ShiftClosure", "saleRefunds"))).toContain(formula);
  expect(prose(field("ShiftClosure", "supplierPayments"))).toContain(formula);
});

test("K6: umur kasbon dibulatkan ke atas", () => {
  expect(prose(field("OwnerCustomerRow", "ageDays"))).toContain(
    "pembulatan ke atas",
  );
});

test("tanpa komponen respons yang tidak dipakai", () => {
  for (const name of ["ProductInactive", "ProductNoPrice"])
    expect(spec).not.toContain(`    ${name}:`);
  const responses = block(LINES, "responses", 2).flatMap(
    (l) => /^ {4}(\w+):$/.exec(l)?.[1] ?? [],
  );
  for (const name of responses)
    expect(spec, name).toContain(`#/components/responses/${name}"`);
});

test("(ruling R1/R5) tidak ada ownerPin atau PIN_REQUIRED di kontrak mana pun", () => {
  expect(spec).not.toContain("ownerPin");
  expect(spec).not.toContain("PIN_REQUIRED");
  expect(spec).not.toContain("/api/sales/today");
});

test("(koreksi mockup M1) VoidRequest: QRIS wajib dipilih di kasir, diabaikan di jalur pemilik", () => {
  const text = prose(schema("VoidRequest"));
  expect(text).toContain("Pilih cara mengembalikan QRIS");
  expect(text).toContain("diabaikan di jalur pemilik");
});

test("(koreksi mockup M1) ShiftClosure.saleRefunds memuat QRIS yang dikembalikan tunai dari laci", () => {
  expect(prose(field("ShiftClosure", "saleRefunds"))).toContain(
    "Σ uang yang dikembalikan dari laci shift ini untuk transaksi yang dibatalkan kasir: bagian tunai transaksi shift lama + bagian QRIS yang dikembalikan tunai dari laci (shift ini atau shift lama)",
  );
});

test("(ruling R4/R12) voidSale kasir: urutan cek, batas 7 hari, laci shift buka; pemilik tidak pernah mengoreksi laci", () => {
  const kasir = prose(op("/api/sales/{saleId}/void", "post"));
  expect(kasir).toContain("tanpa shift buka → 409 SHIFT_CLOSED");
  expect(kasir).toContain("409 VOID_TOO_OLD");
  expect(kasir).toContain(
    "bagian tunai keluar dari laci shift yang sedang buka",
  );
  expect(kasir).not.toContain('"403":');
  const owner = prose(op("/api/owner/sales/{saleId}/void", "post"));
  expect(owner).toContain("tidak pernah mengoreksi laci");
  expect(owner).toContain("409 IN_OPEN_SHIFT");
  expect(owner).toContain("Umur transaksi tidak dibatasi");
});

test("(jawaban pemilik J0, ruling R12) daftar penjualan kasir per shift & cari struk ≤ 7 hari", () => {
  expect(prose(op("/api/sales/shift", "get"))).toContain(
    "Tanpa shift buka → []",
  );
  expect(prose(op("/api/sales/lookup", "get"))).toContain(
    "isoDaysBetween(tanggal jual, hari ini) ≤ 7",
  );
});

test("(ruling R3) kasbon lewat limit: alasan, kelebihan bagian kasbon ini", () => {
  const create = prose(op("/api/sales", "post"));
  expect(create).toContain(
    "tanpa creditLimitReason (atau kosong setelah trim) → 409 CREDIT_LIMIT",
  );
  expect(create).toContain("min(attempted, balance + attempted − creditLimit)");
});

test("(ruling R9) tinjau pengecualian tidak pernah mundur", () => {
  expect(prose(op("/api/owner/exceptions/review", "post"))).toContain(
    "reviewedAt = max(reviewedAt lama, min(upTo, jam server))",
  );
});

/** Endpoint laporan pemilik; true = punya 404 (detail opname). */
const REPORT_OPS: readonly [string, boolean][] = [
  ["/api/owner/reports/sales", false],
  ["/api/owner/reports/products", false],
  ["/api/owner/reports/stock", false],
  ["/api/owner/reports/opname", false],
  ["/api/owner/reports/opname/{productId}", true],
];

test("laporan pemilik: tag owner, ownerCookieAuth, 401, 422; 404 hanya detail opname", () => {
  for (const [path, notFound] of REPORT_OPS) {
    const text = op(path, "get");
    expect(text, path).toContain("tags: [owner]");
    expect(text, path).toContain("- ownerCookieAuth: []");
    expect(text, path).toMatch(
      /"401":\n\s+\$ref: "#\/components\/responses\/Unauthorized"/,
    );
    expect(text, path).toMatch(
      /"422":\n\s+\$ref: "#\/components\/responses\/ValidationFailed"/,
    );
    expect(text.includes('"404":'), path).toBe(notFound);
  }
});

test("(pra-cek) endpoint ekspor laporan tidak ada di F3c-1", () => {
  expect(spec).not.toMatch(/\/api\/owner\/reports\/export/);
  expect(spec).not.toMatch(/operationId: \w*[Ee]xport/);
});

test("(K12) laporan penjualan: pesan 422 checkRange, jepit hari ini, pembanding", () => {
  const sales = prose(op("/api/owner/reports/sales", "get"));
  for (const rule of [
    'period tidak dikenal → 422 VALIDATION "Periode tidak valid"',
    'from/to bukan tanggal sah → "Tanggal tidak valid"',
    'to < from → "Tanggal akhir sebelum tanggal awal"',
    'from > hari ini → "Tanggal di masa depan"',
    'rentang yang tidak sama dengan periode yang memuat from → "Periode tidak cocok"',
    'lebih dari 92 hari (kedua ujung ikut) → "Rentang maksimal 92 hari"',
    "to > hari ini dijepit ke hari ini dan running = true",
    "hari → hari yang sama minggu lalu",
    "bulan yang sudah lewat → bulan sebelumnya penuh",
    "tanggal → rentang tepat sebelumnya sepanjang sama",
  ])
    expect(sales).toContain(rule);
});

test("(jawaban pemilik Q7) potongan menit hanya bila hari terakhir pembanding sejajar", () => {
  const sales = prose(op("/api/owner/reports/sales", "get"));
  expect(sales).toContain(
    "bulan berjalan (running, termasuk hari terakhirnya) → tanggal 1 sampai tanggal sejajar bulan sebelumnya (30 Nov → 1–30 Okt), dijepit ke akhir bulan itu bila bulan itu lebih pendek (1–30 Mar vs 1–28 Feb)",
  );
  expect(sales).toContain(
    "Bila running dan hari terakhir previous sejajar dengan hari ini (selalu untuk hari, minggu, tanggal; untuk bulan bila tanggal sejajar tidak dijepit), previousTotals berhenti di akhir menit sekarang pada hari terakhir pembanding (menit berjalan ikut), seperti Beranda; bila tanggal sejajar dijepit, bulan pembanding yang lebih pendek dihitung penuh.",
  );
  expect(sales).not.toContain("bulan penuh → bulan sebelumnya penuh");
  expect(sales).toContain(
    "current sama dengan getOwnerTodaySummary (revenue, grossProfit, salesCount, avgTicket, newCredit) dan previousTotals.revenue = lastWeekRevenue",
  );
});

test("(K14) status sekarang: dibatalkan keluar dari omzet, masuk voidedCount", () => {
  expect(prose(op("/api/owner/reports/sales", "get"))).toContain(
    "Status penjualan dibaca sekarang (K14)",
  );
  expect(prose(field("KasirSales", "voidedCount"))).toContain(
    "dibuat di rentang dan kini berstatus dibatalkan",
  );
});

test("(jawaban pemilik Q5) marginPermille bertanda, null bila omzet 0", () => {
  expect(prose(field("SalesTotals", "marginPermille"))).toContain(
    "tanda(grossProfit) × round_half_up(|grossProfit| × 1000 / revenue); null bila revenue 0",
  );
});

test("(K15) urutan barang dari server; laba null terakhir; jumlah dalam satuan eceran", () => {
  const products = prose(op("/api/owner/reports/products", "get"));
  expect(products).toContain(
    "jumlah = qtyBase ÷ unitSize eceran terbesar, seri → omzet lebih besar",
  );
  expect(products).toContain("laba = grossProfit terbesar, null terakhir");
  expect(products).toContain(
    'sort tidak dikenal → 422 VALIDATION "Urutan tidak valid"',
  );
  expect(prose(field("ProductSales", "grossProfit"))).toContain(
    "null bila ada baris tanpa HPP",
  );
});

test("(label pemilik) urutan laporan stok di server, bawaan modal", () => {
  const stock = prose(op("/api/owner/reports/stock", "get"));
  expect(stock).toContain("Urutan angka uang ditentukan server");
  expect(stock).toContain("default: modal");
  expect(stock).toContain(
    'sort tidak dikenal → 422 VALIDATION "Urutan tidak valid"',
  );
});
