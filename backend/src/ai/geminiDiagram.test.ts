import { describe, expect, it, vi } from "vitest";
import {
  GeminiDiagramError,
  extractMermaidFromGeminiResponse,
  generateMermaidDiagram,
  validateMermaidDefinition,
} from "./geminiDiagram";

const config = {
  apiKey: "test-secret",
  model: "gemini-test",
  timeoutMs: 1_000,
};

describe("Gemini diagram generation", () => {
  it("sends a structured request and returns validated Mermaid", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      mermaid: "flowchart LR\n  A[Browser] --> B[API]",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await generateMermaidDiagram(
      "Show a browser calling an API",
      config,
      fetcher,
    );

    expect(result).toBe("flowchart LR\n  A[Browser] --> B[API]");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-test:generateContent");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-secret" });
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toBe(
      "Show a browser calling an API",
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("accepts fenced JSON but rejects unsafe Mermaid directives", () => {
    expect(
      extractMermaidFromGeminiResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '```json\n{"mermaid":"sequenceDiagram\\nA->>B: Hi"}\n```',
                },
              ],
            },
          },
        ],
      }),
    ).toBe("sequenceDiagram\nA->>B: Hi");

    expect(() =>
      validateMermaidDefinition(
        'flowchart LR\nclick A "https://example.com"',
      ),
    ).toThrowError(GeminiDiagramError);
  });

  it("does not expose a provider response body when Gemini fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("provider details containing sensitive data", {
        status: 429,
      }),
    );

    await expect(
      generateMermaidDiagram("Show a valid flow", config, fetcher),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Gemini request failed with HTTP 429.",
    });
  });
});
