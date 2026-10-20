import { authHandlers } from "./auth";
import { catalogHandlers } from "./catalog";
import { settingsHandlers } from "./settings";
import { shiftHandlers } from "./shift";
import { systemHandlers } from "./system";

export const handlers = [
  ...systemHandlers,
  ...authHandlers,
  ...shiftHandlers,
  ...settingsHandlers,
  ...catalogHandlers,
];
