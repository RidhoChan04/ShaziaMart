import { HttpResponse, http } from "msw";
import type { Health } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { withScenario } from "../scenarios";

export const systemHandlers = [
  http.get(
    "/api/health",
    withScenario(() => {
      const body: Health = { status: "ok", version: "mock", db: "ok" };
      return HttpResponse.json(body);
    }),
  ),
];
