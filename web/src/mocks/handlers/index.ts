import { authHandlers } from "./auth";
import { cashHandlers } from "./cash";
import { catalogHandlers } from "./catalog";
import { creditPaymentHandlers } from "./credit-payments";
import { customerHandlers } from "./customers";
import { ownerHandlers } from "./owner";
import { ownerCustomerHandlers } from "./owner-customers";
import { ownerDebtHandlers } from "./owner-debts";
import { ownerExceptionHandlers } from "./owner-exceptions";
import { ownerExpiryHandlers } from "./owner-expiry";
import { ownerKasirHandlers } from "./owner-kasir";
import { ownerOpnameHandlers } from "./owner-opname";
import { ownerProductHandlers } from "./owner-products";
import { ownerQrisHandlers } from "./owner-qris";
import { ownerReceiptHandlers } from "./owner-receipts";
import { ownerReportHandlers } from "./owner-reports";
import { ownerSaleHandlers } from "./owner-sales";
import { ownerSettingsHandlers } from "./owner-settings";
import { ownerShiftHandlers } from "./owner-shifts";
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
  ...cashHandlers,
  ...settingsHandlers,
  ...catalogHandlers,
  ...salesHandlers,
  ...customerHandlers,
  ...creditPaymentHandlers,
  ...ownerHandlers,
  ...ownerCustomerHandlers,
  ...ownerSaleHandlers,
  ...ownerExceptionHandlers,
  ...ownerProductHandlers,
  ...ownerReceiptHandlers,
  ...ownerDebtHandlers,
  ...ownerExpiryHandlers,
  ...ownerOpnameHandlers,
  ...ownerReportHandlers,
  ...ownerSettingsHandlers,
  ...ownerKasirHandlers,
  ...ownerShiftHandlers,
  ...ownerQrisHandlers,
  ...staffHandlers,
  ...staffReceiptHandlers,
  ...staffExpiryHandlers,
  ...staffOpnameHandlers,
];
