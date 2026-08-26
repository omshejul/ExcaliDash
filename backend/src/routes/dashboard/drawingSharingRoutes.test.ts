import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerDrawingSharingRoutes } from "./drawingSharingRoutes";
import type { DrawingRouteContext } from "./drawingRouteContext";

const makeApp = () => {
  const drawingFindUnique = vi.fn().mockResolvedValue({
    userId: "owner-1",
    name: "Bookkeeping",
  });
  const userFindMany = vi.fn().mockResolvedValue([
    { id: "user-2", name: "Keith", email: "keith@example.com" },
  ]);
  const userFindUnique = vi.fn().mockResolvedValue({
    id: "user-2",
    isActive: true,
    email: "keith@example.com",
    name: "Keith",
    preferences: null,
  });
  const permissionFindUnique = vi.fn().mockResolvedValue(null);
  const permissionUpsert = vi.fn().mockResolvedValue({
    id: "permission-1",
    granteeUserId: "user-2",
    permission: "edit",
    createdAt: new Date(),
    updatedAt: new Date(),
    granteeUser: { id: "user-2", name: "Keith", email: "keith@example.com" },
  });
  const sendShareInvitation = vi.fn().mockResolvedValue(true);
  const app = express();
  app.use(express.json());

  registerDrawingSharingRoutes(app, {
    prisma: {
      drawing: { findUnique: drawingFindUnique },
      user: { findMany: userFindMany, findUnique: userFindUnique },
      drawingPermission: {
        findUnique: permissionFindUnique,
        upsert: permissionUpsert,
      },
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
    invalidateDrawingsCache: vi.fn(),
    collaborationEmailNotifier: {
      enabled: true,
      sendShareInvitation,
      sendJoinAlert: vi.fn(),
    },
  } as unknown as DrawingRouteContext);

  return {
    app,
    drawingFindUnique,
    userFindMany,
    permissionFindUnique,
    sendShareInvitation,
  };
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

  it("emails a user when drawing access is first granted", async () => {
    const { app, sendShareInvitation } = makeApp();

    const response = await request(app)
      .post("/drawings/drawing-1/permissions")
      .send({ granteeUserId: "user-2", permission: "edit" });

    expect(response.status).toBe(200);
    expect(sendShareInvitation).toHaveBeenCalledWith({
      drawingId: "drawing-1",
      drawingName: "Bookkeeping",
      inviterName: "Owner",
      permission: "edit",
      recipientEmail: "keith@example.com",
      recipientName: "Keith",
      permissionId: "permission-1",
    });
  });

  it("does not email again when an existing permission changes", async () => {
    const { app, permissionFindUnique, sendShareInvitation } = makeApp();
    permissionFindUnique.mockResolvedValue({ id: "permission-1" });

    const response = await request(app)
      .post("/drawings/drawing-1/permissions")
      .send({ granteeUserId: "user-2", permission: "view" });

    expect(response.status).toBe(200);
    expect(sendShareInvitation).not.toHaveBeenCalled();
  });
});
