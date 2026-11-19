import { HttpResponse, http } from "msw";
import type { KasirSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { withScenario } from "../scenarios";
import { requireSession } from "./respond";

export const settingsHandlers = [
  http.get(
    "/api/settings/kasir",
    withScenario(() => {
      const state = mockDb.get();
      // (K19) Publik: nomor pemilik hanya untuk sesi kasir; shiftMaxHours satu sumber dari ambang
      // Perlu perhatian.
      const kasir = requireSession(state);
      const settings: KasirSettings = {
        ...state.settings,
        ownerPhone:
          kasir instanceof Response ? null : state.settings.ownerPhone,
        shiftMaxHours: state.attentionRules.shiftMaxHours,
      };
      return HttpResponse.json(settings);
    }),
  ),
];
