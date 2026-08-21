export type AiDiagramConfig = {
  enabled: boolean;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
};

export const resolveAiDiagramConfig = (deps: {
  getOptionalTrimmedEnv: (key: string) => string | null;
  getOptionalBoolean: (key: string, defaultValue: boolean) => boolean;
  getRequiredEnvNumber: (key: string, defaultValue: number) => number;
}): AiDiagramConfig => {
  const apiKey = deps.getOptionalTrimmedEnv("GEMINI_API_KEY");
  return {
    enabled:
      Boolean(apiKey) && deps.getOptionalBoolean("AI_DIAGRAMS_ENABLED", true),
    apiKey,
    model:
      deps.getOptionalTrimmedEnv("GEMINI_MODEL") || "gemini-2.5-flash",
    timeoutMs: deps.getRequiredEnvNumber("GEMINI_TIMEOUT_MS", 30_000),
  };
};
