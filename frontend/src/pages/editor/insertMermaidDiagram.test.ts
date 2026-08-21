import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseMermaidToExcalidraw } = vi.hoisted(() => ({
  parseMermaidToExcalidraw: vi.fn(),
}));

vi.mock("@excalidraw/mermaid-to-excalidraw", () => ({
  parseMermaidToExcalidraw,
}));

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
  convertToExcalidrawElements: (elements: any[]) =>
    elements.map((element, index) => ({
      id: `generated-${index}`,
      ...element,
    })),
  getCommonBounds: (elements: any[]) => [
    Math.min(...elements.map((element) => element.x)),
    Math.min(...elements.map((element) => element.y)),
    Math.max(...elements.map((element) => element.x + element.width)),
    Math.max(...elements.map((element) => element.y + element.height)),
  ],
}));

import { insertMermaidDiagram } from "./insertMermaidDiagram";

describe("insertMermaidDiagram", () => {
  beforeEach(() => {
    parseMermaidToExcalidraw.mockReset();
  });

  it("places generated elements beside existing work and selects them", async () => {
    parseMermaidToExcalidraw.mockResolvedValue({
      elements: [
        {
          type: "rectangle",
          x: 0,
          y: 0,
          width: 120,
          height: 60,
        },
      ],
      files: {},
    });
    const existing = {
      id: "existing",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      angle: 0,
      strokeColor: "#000000",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: "a0",
      roundness: null,
      seed: 1,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    };
    const updateScene = vi.fn();
    const scrollToContent = vi.fn();
    const excalidrawAPI = {
      addFiles: vi.fn(),
      getSceneElements: vi.fn(() => [existing]),
      getSceneElementsIncludingDeleted: vi.fn(() => [existing]),
      scrollToContent,
      updateScene,
    };

    const count = await insertMermaidDiagram(
      excalidrawAPI,
      "flowchart LR\nA --> B",
    );

    expect(count).toBe(1);
    const update = updateScene.mock.calls[0][0];
    const inserted = update.elements[1];
    expect(inserted.x).toBe(260);
    expect(inserted.y).toBe(0);
    expect(update.appState.selectedElementIds[inserted.id]).toBe(true);
    expect(scrollToContent).toHaveBeenCalledWith([inserted], {
      animate: true,
      fitToViewport: true,
    });
  });

  it("adds converter files before inserting image-backed diagrams", async () => {
    const file = {
      id: "file-1",
      dataURL: "data:image/svg+xml;base64,PHN2Zy8+",
      mimeType: "image/svg+xml",
      created: 1,
    };
    parseMermaidToExcalidraw.mockResolvedValue({
      elements: [
        {
          type: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fileId: "file-1",
        },
      ],
      files: { "file-1": file },
    });
    const addFiles = vi.fn();
    const excalidrawAPI = {
      addFiles,
      getSceneElements: vi.fn(() => []),
      getSceneElementsIncludingDeleted: vi.fn(() => []),
      scrollToContent: vi.fn(),
      updateScene: vi.fn(),
    };

    await insertMermaidDiagram(excalidrawAPI, "stateDiagram\n[*] --> Ready");

    expect(addFiles).toHaveBeenCalledWith([file]);
  });
});
