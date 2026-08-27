import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAiDiagramRoutes } from "./aiDiagram";
import type { DashboardRouteDeps } from "./types";

const makeDeps = (enabled = true): DashboardRouteDeps =>
  ({
    requireAuth: (req, _res, next) => {
      req.user = {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        role: "USER",
      };
      next();
    },
    asyncHandler: (handler) => (req, res, next) => {
      void Promise.resolve(handler(req, res, next)).catch(next);
    },
    config: {
      nodeEnv: "test",
      enableAuditLogging: false,
      aiDiagram: {
        enabled,
        apiKey: enabled ? "test-key" : null,
        model: "gemini-test",
        timeoutMs: 1_000,
      },
    },
    logAuditEvent: vi.fn(),
  }) as unknown as DashboardRouteDeps;

const makeApp = (
  deps: DashboardRouteDeps,
  generate = vi.fn().mockResolvedValue("flowchart LR\nA --> B"),
) => {
  const app = express();
  app.use(express.json());
  registerAiDiagramRoutes(app, deps, generate);
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(500).json({ message: error.message }),
  );
  return { app, generate };
};

describe("AI diagram routes", () => {
  it("reports whether Gemini is configured", async () => {
    const { app } = makeApp(makeDeps(true));
    const response = await request(app).get("/ai/diagram/status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: true, model: "gemini-test" });
  });

  it("generates a diagram without returning the provider key", async () => {
    const { app, generate } = makeApp(makeDeps(true));
    const response = await request(app)
      .post("/ai/diagram")
      .send({ prompt: "Show the login flow" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      mermaid: "flowchart LR\nA --> B",
      model: "gemini-test",
    });
    expect(JSON.stringify(response.body)).not.toContain("test-key");
    expect(generate).toHaveBeenCalledWith(
      "Show the login flow",
      expect.objectContaining({ model: "gemini-test" }),
    );
  });

  it("accepts prompts longer than 4,000 characters", async () => {
    const { app, generate } = makeApp(makeDeps(true));
    const prompt = `Show this system: ${"step ".repeat(1_000)}done`;
    const response = await request(app).post("/ai/diagram").send({ prompt });

    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      prompt,
      expect.objectContaining({ model: "gemini-test" }),
    );
  });

  it("rejects invalid prompts and disabled configuration", async () => {
    const enabledApp = makeApp(makeDeps(true)).app;
    const invalid = await request(enabledApp)
      .post("/ai/diagram")
      .send({ prompt: "short" });
    expect(invalid.status).toBe(400);

    const disabled = await request(makeApp(makeDeps(false)).app)
      .post("/ai/diagram")
      .send({ prompt: "Show the login flow" });
    expect(disabled.status).toBe(503);
  });
});
