import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { installCamera } from "@/test/camera";
import { BarcodeScanner } from "./barcode-scanner";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(options: { torch?: boolean } = {}) {
  const cam = installCamera(options);
  const props = {
    onDetected: vi.fn(),
    onManual: vi.fn(),
    onClose: vi.fn(),
  };
  const utils = render(<BarcodeScanner open purpose="eceran" {...props} />);
  return { cam, props, ...utils };
}

const idle = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("layar penuh: judul, keterangan, arahan, Batal dan Ketik manual; kamera belakang diminta", async () => {
  const { cam } = setup();
  expect(screen.getByRole("dialog", { name: /Scan barcode/ })).toBeVisible();
  expect(screen.getByText("Barcode eceran")).toBeVisible();
  expect(screen.getByText("Arahkan kamera ke barcode")).toBeVisible();
  expect(screen.getByRole("button", { name: "Batal" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Ketik manual" })).toBeVisible();
  await waitFor(() =>
    expect(cam.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    }),
  );
});

test("'ABC' dan angka ber-check digit salah diabaikan; yang valid pertama → onDetected sekali, vibrate(50), onClose", async () => {
  const { cam, props } = setup();
  await waitFor(() => expect(cam.state.detectCalls).toBeGreaterThan(0));
  cam.state.detections = ["ABC", "8996001600268"];
  const calls = cam.state.detectCalls;
  await waitFor(() => expect(cam.state.detectCalls).toBeGreaterThan(calls + 1));
  expect(props.onDetected).not.toHaveBeenCalled();
  expect(cam.track.stop).not.toHaveBeenCalled();

  cam.state.detections = ["ABC", "8996001600269", "8991234567895"];
  await waitFor(() => expect(props.onDetected).toHaveBeenCalledTimes(1));
  expect(props.onDetected).toHaveBeenCalledWith("8996001600269");
  expect(cam.vibrate).toHaveBeenCalledWith(50);
  expect(props.onClose).toHaveBeenCalledTimes(1);
  const after = cam.state.detectCalls;
  await idle(400);
  expect(cam.state.detectCalls).toBe(after);
  expect(props.onDetected).toHaveBeenCalledTimes(1);
});

test("barcode dus 14 digit (itf) yang valid diterima", async () => {
  const { cam, props } = setup();
  cam.state.detections = ["18996001600266"];
  await waitFor(() =>
    expect(props.onDetected).toHaveBeenCalledWith("18996001600266"),
  );
});

test("unmount menghentikan semua track dan interval deteksi", async () => {
  const { cam, unmount } = setup();
  await waitFor(() => expect(cam.state.detectCalls).toBeGreaterThan(0));
  unmount();
  expect(cam.track.stop).toHaveBeenCalled();
  const after = cam.state.detectCalls;
  await idle(400);
  expect(cam.state.detectCalls).toBe(after);
});

test("ditutup (open=false) menghentikan track", async () => {
  const { cam, props, rerender } = setup();
  await waitFor(() => expect(cam.state.detectCalls).toBeGreaterThan(0));
  rerender(<BarcodeScanner open={false} purpose="eceran" {...props} />);
  expect(cam.track.stop).toHaveBeenCalled();
});

test("senter: capability torch → 'Nyalakan senter' memanggil applyConstraints lalu 'Matikan senter'", async () => {
  const user = userEvent.setup();
  const { cam } = setup({ torch: true });
  await user.click(
    await screen.findByRole("button", { name: "Nyalakan senter" }),
  );
  expect(cam.track.applyConstraints).toHaveBeenCalledWith({
    advanced: [{ torch: true }],
  });
  await user.click(
    await screen.findByRole("button", { name: "Matikan senter" }),
  );
  expect(cam.track.applyConstraints).toHaveBeenLastCalledWith({
    advanced: [{ torch: false }],
  });
});

test("tanpa capability torch → tidak ada tombol senter", async () => {
  const { cam } = setup();
  await waitFor(() => expect(cam.state.detectCalls).toBeGreaterThan(0));
  expect(screen.queryByRole("button", { name: /senter/ })).toBeNull();
});

test("NotAllowedError → pesan ramah tanpa arahan; Ketik manual tetap ada", async () => {
  const user = userEvent.setup();
  const cam = installCamera();
  cam.getUserMedia.mockRejectedValue(
    new DOMException("denied", "NotAllowedError"),
  );
  const onManual = vi.fn();
  render(
    <BarcodeScanner
      open
      purpose="besar"
      onDetected={vi.fn()}
      onManual={onManual}
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByText(
      "Kamera tidak bisa dibuka — ketik barcode secara manual",
    ),
  ).toBeVisible();
  expect(screen.queryByText("Arahkan kamera ke barcode")).toBeNull();
  expect(cam.state.detectCalls).toBe(0);
  await user.click(screen.getByRole("button", { name: "Ketik manual" }));
  expect(onManual).toHaveBeenCalledTimes(1);
});

test("Batal → onClose; Ketik manual → onManual; track berhenti setelah ditutup", async () => {
  const user = userEvent.setup();
  const { cam, props, rerender } = setup();
  await waitFor(() => expect(cam.state.detectCalls).toBeGreaterThan(0));
  await user.click(screen.getByRole("button", { name: "Ketik manual" }));
  expect(props.onManual).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Batal" }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  rerender(<BarcodeScanner open={false} purpose="eceran" {...props} />);
  expect(cam.track.stop).toHaveBeenCalled();
});

test("izin kamera baru selesai setelah ditutup → stream langsung dihentikan", async () => {
  const cam = installCamera();
  let grant: (s: unknown) => void = () => {};
  cam.getUserMedia.mockImplementation(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const { unmount } = render(
    <BarcodeScanner
      open
      purpose="cari"
      onDetected={vi.fn()}
      onManual={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  unmount();
  grant(cam.stream);
  await waitFor(() => expect(cam.track.stop).toHaveBeenCalled());
});
