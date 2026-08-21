import express from "express";
import { registerAiDiagramRoutes } from "./aiDiagram";
import { registerCollectionRoutes } from "./collections";
import { registerDrawingRoutes } from "./drawings";
import { registerLibraryRoutes } from "./library";
import { DashboardRouteDeps } from "./types";

export const registerDashboardRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps
) => {
  registerAiDiagramRoutes(app, deps);
  registerDrawingRoutes(app, deps);
  registerCollectionRoutes(app, deps);
  registerLibraryRoutes(app, deps);
};

export type { DashboardRouteDeps } from "./types";
