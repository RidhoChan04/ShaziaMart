import { authHandlers } from "./auth";
import { catalogHandlers } from "./catalog";
import { customerHandlers } from "./customers";
import { salesHandlers } from "./sales";
import { settingsHandlers } from "./settings";
import { shiftHandlers } from "./shift";
import { systemHandlers } from "./system";

export const handlers = [
  ...systemHandlers,
  ...authHandlers,
  ...shiftHandlers,
  ...settingsHandlers,
  ...catalogHandlers,
  ...salesHandlers,
  ...customerHandlers,
];
