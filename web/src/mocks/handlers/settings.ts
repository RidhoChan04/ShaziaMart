import { HttpResponse, http } from "msw";
import type { KasirSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { withScenario } from "../scenarios";

export const settingsHandlers = [
  http.get(
    "/api/settings/kasir",
    withScenario(() => {
      const settings: KasirSettings = mockDb.get().settings;
      return HttpResponse.json(settings);
    }),
  ),
];
