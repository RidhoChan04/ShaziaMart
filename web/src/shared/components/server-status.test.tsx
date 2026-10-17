import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import type { Health } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { ServerStatus } from "./server-status";

const degraded: Health = { status: "degraded", version: "mock", db: "error" };

test("ServerStatus: tersambung saat health ok", async () => {
  renderWithQuery(<ServerStatus />);
  expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();
});

test("ServerStatus: tidak tersambung saat server-mati", async () => {
  setScenario("server-mati");
  renderWithQuery(<ServerStatus />);
  expect(
    await screen.findByText("● Server tidak tersambung"),
  ).toBeInTheDocument();
});

test("ServerStatus: tidak tersambung saat 503 degraded", async () => {
  server.use(
    http.get("/api/health", () => HttpResponse.json(degraded, { status: 503 })),
  );
  renderWithQuery(<ServerStatus />);
  expect(
    await screen.findByText("● Server tidak tersambung"),
  ).toBeInTheDocument();
});

test("ServerStatus: tidak tersambung saat 200 tetapi status bukan ok", async () => {
  server.use(http.get("/api/health", () => HttpResponse.json(degraded)));
  renderWithQuery(<ServerStatus />);
  expect(
    await screen.findByText("● Server tidak tersambung"),
  ).toBeInTheDocument();
});
