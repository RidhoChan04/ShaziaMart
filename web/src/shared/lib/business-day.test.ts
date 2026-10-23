import { describe, expect, test } from "vitest";
import {
  businessDay,
  businessDayLabel,
  daysBefore,
  jakartaDateKey,
} from "./business-day";

describe("hari bisnis Asia/Jakarta", () => {
  test.each([
    [Date.UTC(2026, 9, 16, 16, 59, 59, 999), "20261016"],
    [Date.UTC(2026, 9, 16, 17, 0), "20261017"],
    [Date.UTC(2026, 11, 31, 17, 0), "20270101"],
  ])("jakartaDateKey(%i) = %s", (ms, key) =>
    expect(jakartaDateKey(ms)).toBe(key),
  );

  test("businessDay: 23.59 WIB masih hari itu, 00.00 WIB hari berikutnya", () => {
    expect(businessDay(Date.UTC(2026, 9, 23, 16, 59, 59, 999))).toEqual({
      key: "20261023",
      date: "2026-10-23",
      start: Date.UTC(2026, 9, 22, 17),
      weekday: 5,
    });
    expect(businessDay(Date.UTC(2026, 9, 23, 17)).date).toBe("2026-10-24");
  });

  test("daysBefore melewati batas bulan", () => {
    const day = businessDay(Date.UTC(2026, 10, 2, 3));
    expect(daysBefore(day, 7).date).toBe("2026-10-26");
    expect(daysBefore(day, 7).weekday).toBe(day.weekday);
  });

  test.each([
    [Date.UTC(2026, 9, 23, 3), "Jumat, 23 Okt"],
    [Date.UTC(2026, 9, 23, 17), "Sabtu, 24 Okt"],
    [Date.UTC(2026, 7, 16, 16, 59), "Minggu, 16 Agu"],
  ])("businessDayLabel(%i) = %s", (ms, label) =>
    expect(businessDayLabel(businessDay(ms))).toBe(label),
  );
});
