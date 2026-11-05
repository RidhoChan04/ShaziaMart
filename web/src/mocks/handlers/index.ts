import { authHandlers } from "./auth";
import { catalogHandlers } from "./catalog";
import { customerHandlers } from "./customers";
import { ownerHandlers } from "./owner";
import { ownerDebtHandlers } from "./owner-debts";
import { ownerExpiryHandlers } from "./owner-expiry";
import { ownerProductHandlers } from "./owner-products";
import { ownerReceiptHandlers } from "./owner-receipts";
import { salesHandlers } from "./sales";
import { settingsHandlers } from "./settings";
import { shiftHandlers } from "./shift";
import { staffHandlers } from "./staff";
import { staffExpiryHandlers } from "./staff-expiry";
import { staffOpnameHandlers } from "./staff-opname";
import { staffTunnelGuard } from "./staff-realm";
import { staffReceiptHandlers } from "./staff-receipts";
import { systemHandlers } from "./system";

export const handlers = [
  // Paling depan: request /api/staff lewat terowongan ditolak sebelum handler mana pun.
  staffTunnelGuard,
  ...systemHandlers,
  ...authHandlers,
  ...shiftHandlers,
  ...settingsHandlers,
  ...catalogHandlers,
  ...salesHandlers,
  ...customerHandlers,
  ...ownerHandlers,
  ...ownerProductHandlers,
  ...ownerReceiptHandlers,
  ...ownerDebtHandlers,
  ...ownerExpiryHandlers,
  ...staffHandlers,
  ...staffReceiptHandlers,
  ...staffExpiryHandlers,
  ...staffOpnameHandlers,
];
