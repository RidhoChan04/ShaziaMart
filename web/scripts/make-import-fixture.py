"""Builds src/test/fixtures/data-barang-contoh.xlsx: the template (LAST=50) filled with IMPORT_ROWS.

Cell values must equal IMPORT_ROWS in src/test/import-rows.ts (the read-xlsx test compares them).
Digit-only money/count cells are written as numbers, as Excel stores typed numbers; names, units
and barcodes are text (a barcode stored as a number loses its leading zero). Row 9 stays empty,
rows 15-50 only hold the template's Status formula, and column P (Catatan) is not imported.

Usage: python scripts/make-import-fixture.py src/test/fixtures/data-barang-contoh.xlsx
"""

import subprocess
import sys
from pathlib import Path

from openpyxl import load_workbook

OUT = sys.argv[1]
TEMPLATE = Path(__file__).with_name("make-template.py")

COLUMNS = {  # ImportRow field -> sheet column
    "name": "B", "category": "C", "sellUnit": "D", "barcode": "E", "cost": "F", "price": "G",
    "tierMinQty": "H", "tierPrice": "I", "bigName": "J", "bigSize": "K", "bigBarcode": "L",
    "bigCost": "M", "bigPrice": "N", "minStock": "O",
}
NUMBERS = {"cost", "price", "tierMinQty", "tierPrice", "bigSize", "bigCost", "bigPrice", "minStock"}

SABUN = {"name": "Sabun Batang Giv 72 g", "category": "Sabun & Deterjen", "sellUnit": "pcs", "cost": "2500", "price": "3000"}
ROWS = {
    3: {"name": "Teh Kotak Jasmine 300 ml", "category": "Minuman", "sellUnit": "botol", "barcode": "8996001600276",
        "cost": "3000", "price": "4000", "bigName": "dus", "bigSize": "24", "bigCost": "70000", "bigPrice": "84000",
        "minStock": "24"},
    4: {"name": "Gula Pasir", "category": "Gula & Tepung", "sellUnit": "kg", "cost": "17000", "price": "18000",
        "minStock": "10"},
    5: {"name": "Minyak Goreng Bimoli 2 L", "category": "Minyak Goreng", "sellUnit": "pcs", "barcode": "8992696404441",
        "cost": "34000", "price": "33000"},
    6: {"name": "Mie Sedaap Goreng 90 g", "category": "Mi Instan", "sellUnit": "pcs", "barcode": "089686010947",
        "cost": "2700", "price": "3300"},
    7: {"name": "Beras Pandan Wangi curah", "category": "Beras", "cost": "12000", "price": "14000"},
    8: {"name": "Kopi Kapal Api 165 g", "category": "Kopi & Teh", "sellUnit": "pcs", "barcode": "8991002105126",
        "price": "14500", "minStock": "10"},
    10: {"name": "Gas Elpiji 3 kg", "category": "Gas & Air Galon", "sellUnit": "buah", "cost": "19000", "price": "22000",
         "minStock": "5"},
    11: {"name": "Kecap Bango 220 ml", "category": "Bumbu Dapur", "sellUnit": "pcs", "cost": "10000", "price": "11500",
         "tierMinQty": "12", "tierPrice": "11800"},
    12: SABUN,
    13: SABUN,
    14: {"name": "Beras Cianjur", "category": "Beras Lokal", "sellUnit": "kg", "cost": "12500", "price": "14000",
         "bigName": "karung", "bigSize": "25", "bigCost": "300000", "bigPrice": "340000", "minStock": "50"},
}
NOTES = {10: "isi ulang tabung"}  # column P: free text the importer ignores

subprocess.run([sys.executable, "-I", str(TEMPLATE), OUT, "50"], check=True)
wb = load_workbook(OUT)
ws = wb["Barang"]
for row, cells in ROWS.items():
    for field, value in cells.items():
        ws[f"{COLUMNS[field]}{row}"] = int(value) if field in NUMBERS else value
for row, note in NOTES.items():
    ws[f"P{row}"] = note
wb.save(OUT)
print("saved", OUT)
