import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  GeminiDiagramError,
  generateMermaidDiagram,
} from "../../ai/geminiDiagram";
import { DashboardRouteDeps } from "./types";

const diagramPromptSchema = z.object({
  prompt: z.string().trim().min(8),
});

export const registerAiDiagramRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
  generateDiagram = generateMermaidDiagram,
) => {
  const { requireAuth, asyncHandler, config, logAuditEvent } = deps;
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user?.id || "anonymous"}`,
    message: {
      error: "Rate limit exceeded",
      message: "Too many diagram requests. Try again later.",
    },
  });

  app.get("/ai/diagram/status", requireAuth, (_req, res) => {
    res.json({
      enabled: config.aiDiagram.enabled,
      model: config.aiDiagram.enabled ? config.aiDiagram.model : null,
    });
  });

  app.post(
    "/ai/diagram",
    requireAuth,
    limiter,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!config.aiDiagram.enabled || !config.aiDiagram.apiKey) {
        return res.status(503).json({
          error: "AI diagrams unavailable",
          message: "Diagram generation is not configured.",
        });
      }

      const parsed = diagramPromptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Describe the diagram in at least 8 characters.",
        });
      }

      try {
        const mermaid = await generateDiagram(parsed.data.prompt, {
          apiKey: config.aiDiagram.apiKey,
          model: config.aiDiagram.model,
          timeoutMs: config.aiDiagram.timeoutMs,
        });

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "ai_diagram_generated",
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: {
              model: config.aiDiagram.model,
              promptLength: parsed.data.prompt.length,
              outputLength: mermaid.length,
            },
          });
        }

        return res.json({ mermaid, model: config.aiDiagram.model });
      } catch (error) {
        if (error instanceof GeminiDiagramError) {
          const status = error.code === "INVALID_RESPONSE" ? 422 : 502;
          return res.status(status).json({
            error: "Diagram generation failed",
            message: error.message,
          });
        }
        throw error;
      }
    }),
  );
};
