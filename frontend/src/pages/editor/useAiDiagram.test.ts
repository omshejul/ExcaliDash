import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAiDiagramStatus, insertMermaidDiagram } = vi.hoisted(() => ({
  getAiDiagramStatus: vi.fn(),
  insertMermaidDiagram: vi.fn(),
}));

vi.mock("../../api", () => ({ getAiDiagramStatus }));
vi.mock("./insertMermaidDiagram", () => ({ insertMermaidDiagram }));

import { useAiDiagram } from "./useAiDiagram";

describe("useAiDiagram", () => {
  beforeEach(() => {
    getAiDiagramStatus.mockReset();
    insertMermaidDiagram.mockReset();
  });

  it("enables the editor action only when the backend reports Gemini ready", async () => {
    getAiDiagramStatus.mockResolvedValue({
      enabled: true,
      model: "gemini-test",
    });
    const excalidrawAPIRef = { current: { updateScene: vi.fn() } };
    const { result } = renderHook(() =>
      useAiDiagram({ canEdit: true, excalidrawAPIRef }),
    );

    await waitFor(() => expect(result.current.enabled).toBe(true));
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it("inserts through the current Excalidraw instance", async () => {
    getAiDiagramStatus.mockResolvedValue({ enabled: true, model: "gemini-test" });
    insertMermaidDiagram.mockResolvedValue(6);
    const current = { updateScene: vi.fn() };
    const { result } = renderHook(() =>
      useAiDiagram({ canEdit: true, excalidrawAPIRef: { current } }),
    );

    await expect(result.current.insert("flowchart LR\nA --> B")).resolves.toBe(6);
    expect(insertMermaidDiagram).toHaveBeenCalledWith(
      current,
      "flowchart LR\nA --> B",
    );
  });
});
