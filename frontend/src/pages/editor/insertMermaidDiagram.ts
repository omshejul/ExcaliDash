import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  getCommonBounds,
} from "@excalidraw/excalidraw";

const EMPTY_DRAWING_ORIGIN = 100;
const DRAWING_GAP = 160;

type ExcalidrawApi = {
  addFiles: (files: any[]) => void;
  getSceneElements: () => readonly any[];
  getSceneElementsIncludingDeleted: () => readonly any[];
  scrollToContent: (
    elements: readonly any[],
    options: { animate: boolean; fitToViewport: boolean },
  ) => void;
  updateScene: (scene: Record<string, unknown>) => void;
};

export const insertMermaidDiagram = async (
  excalidrawAPI: ExcalidrawApi,
  definition: string,
): Promise<number> => {
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const { elements: skeletons, files = {} } =
    await parseMermaidToExcalidraw(definition, {
      flowchart: { curve: "linear" },
      maxEdges: 250,
      maxTextSize: 20_000,
      themeVariables: { fontSize: "20px" },
    });
  const generated = convertToExcalidrawElements(skeletons, {
    regenerateIds: true,
  });
  if (generated.length === 0) {
    throw new Error("The generated diagram was empty.");
  }

  const existing = excalidrawAPI.getSceneElements();
  const [generatedMinX, generatedMinY] = getCommonBounds(generated);
  const targetX =
    existing.length > 0
      ? getCommonBounds(existing)[2] + DRAWING_GAP
      : EMPTY_DRAWING_ORIGIN;
  const targetY =
    existing.length > 0
      ? getCommonBounds(existing)[1]
      : EMPTY_DRAWING_ORIGIN;
  const offsetX = targetX - generatedMinX;
  const offsetY = targetY - generatedMinY;
  const positioned = generated.map((element) => ({
    ...element,
    x: element.x + offsetX,
    y: element.y + offsetY,
  }));

  const fileValues = Object.values(files);
  if (fileValues.length > 0) {
    excalidrawAPI.addFiles(fileValues);
  }

  excalidrawAPI.updateScene({
    elements: [
      ...excalidrawAPI.getSceneElementsIncludingDeleted(),
      ...positioned,
    ],
    appState: {
      selectedElementIds: Object.fromEntries(
        positioned.map((element) => [element.id, true]),
      ),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  excalidrawAPI.scrollToContent(positioned, {
    animate: true,
    fitToViewport: true,
  });

  return positioned.length;
};
