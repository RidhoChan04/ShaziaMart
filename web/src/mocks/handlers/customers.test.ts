import { describe, expect, test } from "vitest";
import type { Customer, Problem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { post } from "./test-helpers";

const search = async (q?: string): Promise<Customer[]> => {
  const url = q === undefined ? "/api/customers" : `/api/customers?q=${q}`;
  return (await (await fetch(url)).json()) as Customer[];
};

describe("pelanggan", () => {
  test("cari menurut nama atau telepon; kosong → semua", async () => {
    expect((await search("joko")).map((c) => c.name)).toEqual(["Pak Joko"]);
    expect((await search("500001")).map((c) => c.name)).toEqual(["Bu Sari"]);
    expect(await search("tidakada")).toEqual([]);
    expect(await search()).toHaveLength(mockDb.get().customers.length);
    expect(await search("")).toHaveLength(mockDb.get().customers.length);
  });

  test("owing=true: hanya saldo > 0 (Mbak Dewi tidak ikut), urutan nama tetap; tanpa owing perilaku lama", async () => {
    const owing = async (q = "") =>
      (await (
        await fetch(`/api/customers?owing=true&q=${q}`)
      ).json()) as Customer[];
    expect((await owing()).map((c) => [c.name, c.balance])).toEqual([
      ["Bu Sari", 120_000],
      ["Bu Tini", 640_000],
      ["Pak Joko", 290_000],
      ["Pak Udin", 50_000],
    ]);
    expect((await owing("bu")).map((c) => c.name)).toEqual([
      "Bu Sari",
      "Bu Tini",
    ]);
    expect(await owing("dewi")).toEqual([]);
    expect((await search("dewi")).map((c) => c.name)).toEqual(["Mbak Dewi"]);
    const off = (await (
      await fetch("/api/customers?owing=false")
    ).json()) as Customer[];
    expect(off).toHaveLength(5);
  });

  test("owing=true disaring sebelum batas 20 hasil", async () => {
    mockDb.update((s) => {
      for (let i = 0; i < 30; i++) {
        s.customers.push({
          id: `c${i}`,
          name: `A Warga ${String(i).padStart(2, "0")}`,
          phone: `0899000000${String(i).padStart(2, "0")}`,
          balance: 0,
          creditLimit: 500000,
        });
      }
    });
    const res = await fetch("/api/customers?owing=true");
    expect(((await res.json()) as Customer[]).map((c) => c.name)).toEqual([
      "Bu Sari",
      "Bu Tini",
      "Pak Joko",
      "Pak Udin",
    ]);
  });

  test("hasil cari maksimal 20", async () => {
    mockDb.update((s) => {
      for (let i = 0; i < 30; i++) {
        s.customers.push({
          id: `c${i}`,
          name: `Warga ${i}`,
          phone: `0899000000${String(i).padStart(2, "0")}`,
          balance: 0,
          creditLimit: 500000,
        });
      }
    });
    expect(await search("warga")).toHaveLength(20);
  });

  test("createCustomer: default limit 500000, saldo 0, bisa dicari", async () => {
    const res = await post("/api/customers", {
      name: "Bu Wati",
      phone: "081299990000",
    });
    expect(res.status).toBe(201);
    const customer = (await res.json()) as Customer;
    expect(customer).toMatchObject({
      name: "Bu Wati",
      phone: "081299990000",
      balance: 0,
      creditLimit: 500000,
    });
    expect(await search("wati")).toEqual([customer]);
  });

  test.each([
    ["telepon 7 digit", { name: "Bu Wati", phone: "0812999" }],
    ["telepon 16 digit", { name: "Bu Wati", phone: "0812999900001111" }],
    ["telepon berhuruf", { name: "Bu Wati", phone: "0812-9999-000" }],
    ["tanpa telepon", { name: "Bu Wati" }],
    ["nama 1 huruf", { name: " W ", phone: "081299990000" }],
  ])("createCustomer validasi telepon & nama: %s → 422", async (_, body) => {
    const res = await post("/api/customers", body);
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).code).toBe("VALIDATION");
    expect(mockDb.get().customers).toHaveLength(5);
  });
});
