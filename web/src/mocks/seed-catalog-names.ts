/** 20 kategori template Excel, urut seperti di template. */
export const TEMPLATE_CATEGORIES: readonly string[] = [
  "Beras",
  "Minyak Goreng",
  "Gula & Tepung",
  "Telur",
  "Mi Instan",
  "Bumbu Dapur",
  "Kopi & Teh",
  "Susu",
  "Minuman",
  "Makanan Ringan",
  "Roti & Biskuit",
  "Makanan Kaleng",
  "Sabun & Deterjen",
  "Perawatan Diri",
  "Kebutuhan Bayi",
  "Rokok",
  "Gas & Air Galon",
  "Obat Ringan",
  "Alat Tulis",
  "Lain-lain",
];

/** Nama barang sembako realistis per kategori untuk data contoh. `pack`: satuan grosir [nama, isi]. */
export type CatalogName = {
  name: string;
  category: string;
  pack?: readonly [string, number];
};

export const CATALOG_NAMES: readonly CatalogName[] = [
  // beras
  { name: "Beras Rojolele 5 kg", category: "Beras" },
  { name: "Beras Setra Ramos 5 kg", category: "Beras" },
  { name: "Beras Premium Cap Topi Koki 5 kg", category: "Beras" },
  { name: "Beras Merah 1 kg", category: "Beras" },
  { name: "Beras Ketan Putih 1 kg", category: "Beras" },
  { name: "Beras Pera 10 kg", category: "Beras" },
  // minyak
  { name: "Minyak Goreng Filma 1 L", category: "Minyak Goreng" },
  { name: "Minyak Goreng Sania 2 L", category: "Minyak Goreng" },
  { name: "Minyak Goreng Tropical 1 L", category: "Minyak Goreng" },
  { name: "Minyak Goreng Fortune 2 L", category: "Minyak Goreng" },
  { name: "Minyak Wijen ABC 100 ml", category: "Minyak Goreng" },
  { name: "Margarin Blue Band 200 g", category: "Minyak Goreng" },
  // gula
  { name: "Gula Pasir Gulaku 1 kg", category: "Gula & Tepung" },
  { name: "Gula Merah Batok 500 g", category: "Gula & Tepung" },
  { name: "Gula Pasir Rose Brand 1 kg", category: "Gula & Tepung" },
  { name: "Gula Jawa Aren 250 g", category: "Gula & Tepung" },
  { name: "Sirup Marjan Cocopandan 460 ml", category: "Gula & Tepung" },
  { name: "Madu Nusantara 150 ml", category: "Gula & Tepung" },
  // mie
  { name: "Indomie Soto Mie", category: "Mi Instan", pack: ["dus", 40] },
  { name: "Indomie Ayam Bawang", category: "Mi Instan", pack: ["dus", 40] },
  { name: "Mie Sedaap Goreng", category: "Mi Instan", pack: ["dus", 40] },
  { name: "Mie Sedaap Soto", category: "Mi Instan", pack: ["dus", 40] },
  { name: "Supermi Ayam Bawang", category: "Mi Instan" },
  { name: "Sarimi Isi 2 Ayam Kecap", category: "Mi Instan" },
  { name: "Pop Mie Ayam Cup", category: "Mi Instan" },
  { name: "Bihun Jagung Padamu 150 g", category: "Mi Instan" },
  { name: "Mie Telur Cap 3 Ayam 200 g", category: "Mi Instan" },
  { name: "Makaroni Spiral Bonanza 200 g", category: "Mi Instan" },
  // kopi / teh
  { name: "Kopi Good Day Cappuccino", category: "Kopi & Teh" },
  { name: "Kopi ABC Susu Sachet", category: "Kopi & Teh" },
  { name: "Kopi Torabika Duo", category: "Kopi & Teh" },
  { name: "Kopi Luwak White Koffie", category: "Kopi & Teh" },
  { name: "Teh Celup Sosro 25 Kantong", category: "Kopi & Teh" },
  { name: "Teh Tubruk Gopek 50 g", category: "Kopi & Teh" },
  { name: "Teh Sariwangi 25 Kantong", category: "Kopi & Teh" },
  { name: "Nescafe Classic 50 g", category: "Kopi & Teh" },
  // susu
  { name: "Susu Kental Manis Frisian Flag 370 g", category: "Susu" },
  {
    name: "Susu UHT Ultra Milk Coklat 250 ml",
    category: "Susu",
    pack: ["dus", 24],
  },
  { name: "Susu UHT Indomilk Full Cream 1 L", category: "Susu" },
  { name: "Susu Bubuk Dancow 400 g", category: "Susu" },
  { name: "Susu Kental Manis Carnation 490 g", category: "Susu" },
  { name: "Susu Bendera Cokelat 200 ml", category: "Susu" },
  // bumbu
  { name: "Garam Dapur Refina 250 g", category: "Bumbu Dapur" },
  { name: "Kecap Manis Bango 220 ml", category: "Bumbu Dapur" },
  { name: "Saus Sambal ABC 335 ml", category: "Bumbu Dapur" },
  { name: "Royco Ayam 9 g", category: "Bumbu Dapur" },
  { name: "Masako Sapi 11 g", category: "Bumbu Dapur" },
  { name: "Merica Bubuk Ladaku 50 g", category: "Bumbu Dapur" },
  { name: "Terasi Udang ABC 80 g", category: "Bumbu Dapur" },
  { name: "Kecap Asin Sedaap 135 ml", category: "Bumbu Dapur" },
  { name: "Bawang Goreng Sasa 100 g", category: "Bumbu Dapur" },
  { name: "Santan Kara 200 ml", category: "Bumbu Dapur" },
  // sabun / deterjen
  { name: "Sabun Mandi Lifebuoy Merah 75 g", category: "Sabun & Deterjen" },
  { name: "Sabun Cuci Piring Sunlight 800 ml", category: "Sabun & Deterjen" },
  { name: "Deterjen Rinso Anti Noda 800 g", category: "Sabun & Deterjen" },
  { name: "Deterjen Daia Putih 900 g", category: "Sabun & Deterjen" },
  { name: "Shampoo Pantene Sachet", category: "Sabun & Deterjen" },
  { name: "Pasta Gigi Pepsodent 190 g", category: "Sabun & Deterjen" },
  { name: "Pewangi Pakaian Molto 900 ml", category: "Sabun & Deterjen" },
  { name: "Sabun Mandi Lux Putih 85 g", category: "Sabun & Deterjen" },
  { name: "Pembersih Lantai Wipol 780 ml", category: "Sabun & Deterjen" },
  { name: "Tisu Paseo 250 Sheet", category: "Sabun & Deterjen" },
  // minuman
  { name: "Air Mineral Aqua 600 ml", category: "Minuman", pack: ["dus", 24] },
  {
    name: "Air Mineral Le Minerale 600 ml",
    category: "Minuman",
    pack: ["dus", 24],
  },
  { name: "Teh Botol Sosro 450 ml", category: "Minuman", pack: ["dus", 12] },
  { name: "Coca-Cola 390 ml", category: "Minuman" },
  { name: "Sprite 390 ml", category: "Minuman" },
  { name: "Pocari Sweat 500 ml", category: "Minuman" },
  { name: "Fruit Tea Jasmine 350 ml", category: "Minuman" },
  { name: "Minuman Isotonik Mizone 500 ml", category: "Minuman" },
  { name: "Floridina Orange 360 ml", category: "Minuman" },
  { name: "Teh Pucuk Harum 350 ml", category: "Minuman", pack: ["dus", 24] },
];
