import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { PeriodBar } from "./period-bar";
import type { ReportSearch } from "./report-search";

const TODAY = "2026-11-05";
const NOV: ReportSearch = {
  periode: "bulan",
  dari: "2026-11-01",
  sampai: "2026-11-30",
};

function setup(search: ReportSearch = NOV) {
  const onChange = vi.fn();
  render(<PeriodBar search={search} today={TODAY} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

test("segmen periode: Bulan terpilih; judul November 2026", () => {
  setup();
  const seg = screen.getByRole("group", { name: "Periode" });
  expect(
    within(seg)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["Hari", "Minggu", "Bulan", "Tanggal"]);
  expect(within(seg).getByRole("button", { name: "Bulan" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(within(seg).getByRole("button", { name: "Hari" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByText("November 2026")).toBeInTheDocument();
});

test("navigator: berikutnya nonaktif di periode berjalan; sebelumnya → Oktober penuh", async () => {
  const { onChange, user } = setup();
  expect(
    screen.getByRole("button", { name: "Periode berikutnya" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Periode sebelumnya" }));
  expect(onChange).toHaveBeenCalledWith({
    periode: "bulan",
    dari: "2026-10-01",
    sampai: "2026-10-31",
  });
});

test("navigator di periode lewat: berikutnya aktif", async () => {
  const { onChange, user } = setup({
    periode: "minggu",
    dari: "2026-10-26",
    sampai: "2026-11-01",
  });
  expect(screen.getByText("26 Okt–1 Nov 2026")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Periode berikutnya" }));
  expect(onChange).toHaveBeenCalledWith({
    periode: "minggu",
    dari: "2026-11-02",
    sampai: "2026-11-08",
  });
});

test("tombol periode setinggi 44 px", () => {
  setup();
  for (const name of ["Periode sebelumnya", "Periode berikutnya", "Hari"])
    expect(screen.getByRole("button", { name })).toHaveClass("min-h-11");
});

test.each([
  ["Hari", { periode: "hari", dari: TODAY, sampai: TODAY }],
  ["Minggu", { periode: "minggu", dari: "2026-11-02", sampai: "2026-11-08" }],
])("segmen %s → periode yang memuat hari ini", async (name, expected) => {
  const { onChange, user } = setup();
  await user.click(screen.getByRole("button", { name }));
  expect(onChange).toHaveBeenCalledWith(expected);
});

test("judul Hari memakai nama hari", () => {
  setup({ periode: "hari", dari: TODAY, sampai: TODAY });
  expect(screen.getByText("Kamis, 5 Nov 2026")).toBeInTheDocument();
});

test("Tanggal → lembar Pilih tanggal; 93 hari → galat dan Tampilkan nonaktif", async () => {
  const { onChange, user } = setup();
  await user.click(screen.getByRole("button", { name: "Tanggal" }));
  const sheet = await screen.findByRole("dialog", { name: "Pilih tanggal" });
  const dari = within(sheet).getByLabelText("Dari");
  const sampai = within(sheet).getByLabelText("Sampai");
  expect(dari).toHaveValue("2026-11-01");
  expect(sampai).toHaveValue(TODAY);

  fireEvent.change(dari, { target: { value: "2026-08-04" } });
  fireEvent.change(sampai, { target: { value: "2026-11-04" } });
  expect(
    within(sheet).getByText("Rentang maksimal 92 hari"),
  ).toBeInTheDocument();
  expect(sampai).toHaveAttribute("aria-invalid", "true");
  const show = within(sheet).getByRole("button", { name: "Tampilkan" });
  expect(show).toBeDisabled();

  fireEvent.change(sampai, { target: { value: "2026-08-01" } });
  expect(
    within(sheet).getByText("Tanggal akhir sebelum tanggal awal"),
  ).toBeInTheDocument();

  fireEvent.change(dari, { target: { value: "2026-10-10" } });
  fireEvent.change(sampai, { target: { value: TODAY } });
  expect(show).toBeEnabled();
  await user.click(show);
  expect(onChange).toHaveBeenCalledWith({
    periode: "tanggal",
    dari: "2026-10-10",
    sampai: TODAY,
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Tanggal: tanggal awal di masa depan ditolak", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "Tanggal" }));
  const sheet = await screen.findByRole("dialog", { name: "Pilih tanggal" });
  fireEvent.change(within(sheet).getByLabelText("Dari"), {
    target: { value: "2026-11-06" },
  });
  fireEvent.change(within(sheet).getByLabelText("Sampai"), {
    target: { value: "2026-11-07" },
  });
  expect(within(sheet).getByText("Tanggal di masa depan")).toBeInTheDocument();
});

test("periode Tanggal: judul rentang dan segmen Tanggal terpilih", () => {
  setup({ periode: "tanggal", dari: "2026-10-10", sampai: TODAY });
  expect(screen.getByText("10 Okt–5 Nov 2026")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tanggal" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
