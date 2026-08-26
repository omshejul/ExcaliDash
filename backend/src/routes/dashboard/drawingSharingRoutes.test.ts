import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerDrawingSharingRoutes } from "./drawingSharingRoutes";
import type { DrawingRouteContext } from "./drawingRouteContext";

const makeApp = () => {
  const drawingFindUnique = vi.fn().mockResolvedValue({ userId: "owner-1" });
  const userFindMany = vi.fn().mockResolvedValue([
    { id: "user-2", name: "Keith", email: "keith@example.com" },
  ]);
  const app = express();
  app.use(express.json());

  registerDrawingSharingRoutes(app, {
    prisma: {
      drawing: { findUnique: drawingFindUnique },
      user: { findMany: userFindMany },
    },
    requireAuth: (req, _res, next) => {
      req.user = {
        id: "owner-1",
        email: "owner@example.com",
        name: "Owner",
        role: "USER",
      };
      next();
    },
    asyncHandler: (handler) => (req, res, next) => {
      void Promise.resolve(handler(req, res, next)).catch(next);
    },
    config: { enableAuditLogging: false },
  } as unknown as DrawingRouteContext);

  return { app, drawingFindUnique, userFindMany };
};

describe("drawing sharing routes", () => {
  it("resolves active users from a one-character query", async () => {
    const { app, drawingFindUnique, userFindMany } = makeApp();

    const response = await request(app).get(
      "/drawings/drawing-1/share-resolve?q=k",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      users: [{ id: "user-2", name: "Keith", email: "keith@example.com" }],
    });
    expect(drawingFindUnique).toHaveBeenCalledOnce();
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });
});
