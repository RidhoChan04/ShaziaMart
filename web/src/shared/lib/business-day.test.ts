import { describe, expect, test } from "vitest";
import {
  businessDay,
  businessDayLabel,
  daysBefore,
  formatDateLong,
  jakartaDateKey,
  jakartaHour,
  jakartaTime,
  relativeDayTime,
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

describe("jakartaHour", () => {
  test.each([
    [Date.UTC(2026, 9, 22, 16, 59, 59, 999), 23],
    [Date.UTC(2026, 9, 22, 17), 0],
    [Date.UTC(2026, 9, 23, 2, 30), 9],
    [Date.UTC(1969, 11, 31, 23, 59), 6],
  ])("jakartaHour(%i) = %i", (ms, hour) => expect(jakartaHour(ms)).toBe(hour));
});

describe("jakartaTime", () => {
  test.each([
    [Date.UTC(2026, 9, 28, 7, 5), "14.05"],
    [Date.UTC(2026, 9, 28, 16, 59), "23.59"],
    [Date.UTC(2026, 9, 28, 17, 0), "00.00"],
    [Date.UTC(2026, 9, 28, 2, 9), "09.09"],
  ])("jakartaTime(%i) = %s", (ms, text) => expect(jakartaTime(ms)).toBe(text));
});

describe("relativeDayTime", () => {
  const now = Date.UTC(2026, 10, 2, 8, 0); // 2 Nov 2026 15.00 WIB
  test.each([
    [Date.UTC(2026, 10, 2, 7, 5), "Hari ini 14.05"],
    // 00.10 WIB 2 Nov masih 1 Nov menurut UTC, tapi hari ini menurut Jakarta
    [Date.UTC(2026, 10, 1, 17, 10), "Hari ini 00.10"],
    [Date.UTC(2026, 10, 1, 16, 30), "Kemarin 23.30"],
    [Date.UTC(2026, 10, 1, 2, 10), "Kemarin 09.10"],
    [Date.UTC(2026, 9, 28, 7, 5), "28 Okt 14.05"],
    [Date.UTC(2026, 9, 31, 17, 30), "Kemarin 00.30"],
  ])("relativeDayTime(%i) = %s", (ms, text) =>
    expect(relativeDayTime(ms, now)).toBe(text),
  );
});

describe("formatDateLong", () => {
  test.each([
    [Date.UTC(2026, 9, 28, 7, 5), "28 Okt 2026"],
    [Date.UTC(2026, 11, 31, 17, 0), "1 Jan 2027"],
    [Date.UTC(2026, 4, 5, 3), "5 Mei 2026"],
    [Date.UTC(2026, 7, 5, 3), "5 Agu 2026"],
  ])("formatDateLong(%i) = %s", (ms, text) =>
    expect(formatDateLong(ms)).toBe(text),
  );
});
