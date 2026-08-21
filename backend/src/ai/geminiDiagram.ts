const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const MAX_MERMAID_LENGTH = 20_000;

const SYSTEM_INSTRUCTION = `You create concise Mermaid diagrams for an Excalidraw whiteboard.
Return JSON with exactly one field named mermaid.
Use one supported diagram type: flowchart, sequenceDiagram, classDiagram, stateDiagram, or erDiagram.
Prefer short labels and readable layouts. For flowcharts, write edge labels as A -->|label| B and never as A --> B: label. Use one statement per line.
Do not use Markdown fences, HTML, links, click directives, init directives, icons, or external resources.`;

export type GeminiDiagramConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

export class GeminiDiagramError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PROVIDER_ERROR"
      | "PROVIDER_TIMEOUT"
      | "INVALID_RESPONSE",
  ) {
    super(message);
  }
}

const stripMarkdownFence = (value: string): string => {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
};

export const validateMermaidDefinition = (raw: unknown): string => {
  if (typeof raw !== "string") {
    throw new GeminiDiagramError(
      "Gemini returned an invalid diagram.",
      "INVALID_RESPONSE",
    );
  }

  const definition = raw.trim();
  if (definition.length === 0 || definition.length > MAX_MERMAID_LENGTH) {
    throw new GeminiDiagramError(
      "Gemini returned an invalid diagram.",
      "INVALID_RESPONSE",
    );
  }

  if (
    !/^(flowchart\b|graph\b|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b)/i.test(
      definition,
    )
  ) {
    throw new GeminiDiagramError(
      "Gemini returned an unsupported diagram type.",
      "INVALID_RESPONSE",
    );
  }

  const unsafeSyntax =
    /%%\{|^\s*click\s+|javascript:|<\s*script\b|<\s*iframe\b/im;
  if (unsafeSyntax.test(definition)) {
    throw new GeminiDiagramError(
      "Gemini returned unsafe diagram syntax.",
      "INVALID_RESPONSE",
    );
  }

  return definition;
};

export const extractMermaidFromGeminiResponse = (
  payload: GeminiResponse,
): string => {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    const blocked = payload.promptFeedback?.blockReason;
    throw new GeminiDiagramError(
      blocked
        ? "Gemini declined this diagram request. Try different wording."
        : "Gemini returned an empty diagram.",
      "INVALID_RESPONSE",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFence(text));
  } catch {
    throw new GeminiDiagramError(
      "Gemini returned malformed diagram data.",
      "INVALID_RESPONSE",
    );
  }

  const mermaid =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).mermaid
      : null;
  return validateMermaidDefinition(mermaid);
};

export const generateMermaidDiagram = async (
  prompt: string,
  config: GeminiDiagramConfig,
  fetcher: typeof fetch = fetch,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const endpoint = `${GEMINI_API_ROOT}/models/${encodeURIComponent(
    config.model,
  )}:generateContent`;

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              mermaid: {
                type: "STRING",
                description: "A valid Mermaid diagram definition",
              },
            },
            required: ["mermaid"],
          },
          temperature: 0.2,
          maxOutputTokens: 4_096,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GeminiDiagramError(
        `Gemini request failed with HTTP ${response.status}.`,
        "PROVIDER_ERROR",
      );
    }

    return extractMermaidFromGeminiResponse(
      (await response.json()) as GeminiResponse,
    );
  } catch (error) {
    if (error instanceof GeminiDiagramError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiDiagramError(
        "Gemini took too long to respond. Try again.",
        "PROVIDER_TIMEOUT",
      );
    }
    throw new GeminiDiagramError(
      "Could not reach Gemini. Try again.",
      "PROVIDER_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
};
