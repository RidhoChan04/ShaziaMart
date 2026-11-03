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
  expect(STAFF_OPS).toHaveLength(13);
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

test("tanpa komponen respons yang tidak dipakai", () => {
  for (const name of ["ProductInactive", "ProductNoPrice"])
    expect(spec).not.toContain(`    ${name}:`);
  const responses = block(LINES, "responses", 2).flatMap(
    (l) => /^ {4}(\w+):$/.exec(l)?.[1] ?? [],
  );
  for (const name of responses)
    expect(spec, name).toContain(`#/components/responses/${name}"`);
});
