import { describe, expect, test } from "vitest";
import {
  addIsoDays,
  businessDay,
  businessDayLabel,
  daysBefore,
  formatDateLong,
  formatIsoDate,
  formatIsoDayMonth,
  isIsoDate,
  isoDaysBetween,
  jakartaDateKey,
  jakartaHour,
  jakartaIsoDate,
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

describe("tanggal kalender ISO (Asia/Jakarta)", () => {
  test("tanggal ISO WIB", () => {
    expect(jakartaIsoDate(Date.UTC(2026, 10, 1, 17, 30))).toBe("2026-11-02"); // 00.30 WIB
    expect(addIsoDays("2026-11-02", 14)).toBe("2026-11-16");
    expect(addIsoDays("2026-12-25", 7)).toBe("2027-01-01");
    expect(isoDaysBetween("2026-11-02", "2026-11-11")).toBe(9);
    expect(isoDaysBetween("2026-11-02", "2026-10-30")).toBe(-3);
    expect(formatIsoDate("2027-04-20")).toBe("20 Apr 2027");
    expect(formatIsoDayMonth("2026-10-30")).toBe("30 Okt");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-11-02")).toBe(true);
  });

  test("jakartaIsoDate: 23.59 WIB masih hari itu", () => {
    expect(jakartaIsoDate(Date.UTC(2026, 10, 1, 16, 59, 59, 999))).toBe(
      "2026-11-01",
    );
  });

  test.each([
    ["2028-02-29", true],
    ["2026-02-29", false],
    ["2100-02-29", false],
    ["2000-02-29", true],
    ["2026-04-31", false],
    ["2026-12-31", true],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["2026-11-00", false],
    ["2026-1-02", false],
    ["2026-11-02T00:00", false],
    [" 2026-11-02", false],
    ["", false],
  ])("isIsoDate(%j) = %s", (s, ok) => expect(isIsoDate(s)).toBe(ok));

  test("addIsoDays: mundur, tahun kabisat, nol", () => {
    expect(addIsoDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addIsoDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addIsoDays("2026-11-02", 0)).toBe("2026-11-02");
    expect(addIsoDays("2026-11-02", 30)).toBe("2026-12-02");
  });

  test("tanggal tidak sah atau hari bukan bilangan bulat → RangeError", () => {
    expect(() => addIsoDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addIsoDays("2026-11-02", 1.5)).toThrow(RangeError);
    expect(() => isoDaysBetween("2026-11-02", "x")).toThrow(RangeError);
    expect(() => formatIsoDate("2026-11-31")).toThrow(RangeError);
  });

  test("format: hari tanpa nol depan, nama bulan Indonesia", () => {
    expect(formatIsoDate("2026-05-05")).toBe("5 Mei 2026");
    expect(formatIsoDate("2026-08-01")).toBe("1 Agu 2026");
    expect(formatIsoDayMonth("2026-12-09")).toBe("9 Des");
  });
});
