import { HttpResponse, http } from "msw";
import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { withScenario } from "../scenarios";
import { invalid, readJson } from "./respond";

const MAX_RESULTS = 20;
const DEFAULT_CREDIT_LIMIT = 500_000;

export const customerHandlers = [
  http.get(
    "/api/customers",
    withScenario(({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = (params.get("q") ?? "").trim().toLowerCase();
      // owing=true (lembar Pelunasan kasbon): disaring sebelum batas 20 hasil.
      const owing = params.get("owing") === "true";
      const matches: Customer[] = mockDb
        .get()
        .customers.filter(
          (c) =>
            (!owing || c.balance > 0) &&
            (c.name.toLowerCase().includes(q) || c.phone.includes(q)),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "id"))
        .slice(0, MAX_RESULTS);
      return HttpResponse.json(matches);
    }),
  ),
  http.post(
    "/api/customers",
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const phone = body?.phone;
      if (name.length < 2) return invalid("Nama minimal 2 huruf");
      if (typeof phone !== "string" || !/^\d{8,15}$/.test(phone)) {
        return invalid("Telepon harus 8–15 digit angka");
      }
      const customer: Customer = {
        id: newId(),
        name,
        phone,
        balance: 0,
        creditLimit: DEFAULT_CREDIT_LIMIT,
      };
      mockDb.update((s) => {
        s.customers.push(customer);
      });
      return HttpResponse.json(customer, { status: 201 });
    }),
  ),
];
