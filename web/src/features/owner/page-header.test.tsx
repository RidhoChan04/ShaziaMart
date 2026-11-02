import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setScenario } from "@/mocks/scenarios";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { renderWithQuery } from "@/test/render-app";
import { PageHeader } from "./page-header";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Sabtu 17 Okt 2026, 09.00 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 17, 2, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("header: tanggal hari bisnis dan judul besar sebagai satu-satunya heading", async () => {
  renderWithQuery(<PageHeader title="Barang" />);
  expect(screen.getByText("Sabtu, 17 Okt")).toBeInTheDocument();
  expect(screen.getAllByRole("heading")).toHaveLength(1);
  expect(
    screen.getByRole("heading", { level: 1, name: "Barang" }),
  ).toBeInTheDocument();
  await screen.findByText("Toko online");
});

test("pil status: kosong saat memeriksa, Toko online lalu Toko offline saat server mati", async () => {
  const { queryClient } = renderWithQuery(<PageHeader title="Beranda" />);
  const status = screen.getByRole("status");
  expect(status).toBeEmptyDOMElement();

  // Titik warna aria-hidden: teks status persis tanpa simbol.
  await waitFor(() => expect(status).toHaveTextContent(/^Toko online$/));

  setScenario("server-mati");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  await waitFor(() => expect(status).toHaveTextContent(/^Toko offline$/));
});

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  observe = () => {};
  disconnect = () => {};
  readonly callback: Callback;
  constructor(callback: Callback) {
    this.callback = callback;
    FakeIntersectionObserver.last = this;
  }
}

test("bar judul kecil: tersembunyi dari pembaca layar, muncul saat judul besar tergulir lewat", async () => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  renderWithQuery(<PageHeader title="Kasbon" />);
  const bar = screen.getByTestId("compact-title");
  expect(bar).toHaveAttribute("aria-hidden", "true");
  expect(bar).toHaveTextContent("Kasbon");
  expect(bar).toHaveClass("opacity-0");

  act(() =>
    FakeIntersectionObserver.last?.callback([
      {
        isIntersecting: false,
        boundingClientRect: { top: -50, bottom: -10 } as DOMRectReadOnly,
      },
    ]),
  );
  expect(bar).toHaveClass("opacity-100");
  await screen.findByText("Toko online");
});
