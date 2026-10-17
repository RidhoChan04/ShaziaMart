import { onlineManager } from "@tanstack/react-query";
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

test("ServerStatus: server-mati terdeteksi walau browser melaporkan offline", async () => {
  onlineManager.setOnline(false);
  try {
    setScenario("server-mati");
    renderWithQuery(<ServerStatus />);
    expect(
      await screen.findByText("● Server tidak tersambung"),
    ).toBeInTheDocument();
  } finally {
    onlineManager.setOnline(true);
  }
});

test("ServerStatus: tetap tersambung saat browser offline tetapi server normal", async () => {
  onlineManager.setOnline(false);
  try {
    renderWithQuery(<ServerStatus />);
    expect(await screen.findByText("● Server tersambung")).toBeInTheDocument();
  } finally {
    onlineManager.setOnline(true);
  }
});
