import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { renderApp } from "@/test/render-app";

// Chunk owner yang lambat dimuat (jaringan HP pelan).
vi.mock("@/features/owner", async (importOriginal) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return importOriginal();
});

test("route lazy menampilkan 'Memuat…' saat chunk belum siap", async () => {
  await ownerLogin();
  renderApp("/owner");
  const pending = await screen.findByText("Memuat…");
  expect(pending).toHaveAttribute("role", "status");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Beranda" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Memuat…")).not.toBeInTheDocument();
});
