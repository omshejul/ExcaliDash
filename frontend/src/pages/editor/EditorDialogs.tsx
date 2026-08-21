import React from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { ShareModal } from "../../components/ShareModal";
import { HistoryPanel } from "../../components/HistoryPanel";
import { GenerateDiagramDialog } from "../../components/GenerateDiagramDialog";

type PreviewBackup = {
  elements: readonly any[];
  appState: any;
  files: any;
};

type EditorDialogsProps = {
  drawingId?: string;
  drawingName: string;
  aiDiagramModel: string | null;
  excalidrawAPIRef: React.MutableRefObject<any>;
  isHistoryOpen: boolean;
  isGenerateDiagramOpen: boolean;
  isShareOpen: boolean;
  previewBackupRef: React.MutableRefObject<PreviewBackup | null>;
  onCloseHistory: () => void;
  onCloseGenerateDiagram: () => void;
  onCloseShare: () => void;
  onInsertAiDiagram: (mermaid: string) => Promise<number>;
};

export const EditorDialogs: React.FC<EditorDialogsProps> = ({
  drawingId,
  drawingName,
  aiDiagramModel,
  excalidrawAPIRef,
  isHistoryOpen,
  isGenerateDiagramOpen,
  isShareOpen,
  previewBackupRef,
  onCloseHistory,
  onCloseGenerateDiagram,
  onCloseShare,
  onInsertAiDiagram,
}) => {
  if (!drawingId) return null;

  return (
    <>
      <GenerateDiagramDialog
        isOpen={isGenerateDiagramOpen}
        model={aiDiagramModel}
        onClose={onCloseGenerateDiagram}
        onInsert={onInsertAiDiagram}
      />
      <ShareModal
        drawingId={drawingId}
        drawingName={drawingName}
        isOpen={isShareOpen}
        onClose={onCloseShare}
      />
      <HistoryPanel
        drawingId={drawingId}
        isOpen={isHistoryOpen}
        onClose={onCloseHistory}
        onPreview={(snapshot) => {
          const excalidrawAPI = excalidrawAPIRef.current;
          if (!excalidrawAPI) return;
          if (snapshot) {
            if (!previewBackupRef.current) {
              previewBackupRef.current = {
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                appState: excalidrawAPI.getAppState(),
                files: excalidrawAPI.getFiles(),
              };
            }
            const elements = Array.isArray(snapshot.elements)
              ? snapshot.elements
              : [];
            const files = snapshot.files || {};
            if (Object.keys(files).length > 0) {
              excalidrawAPI.addFiles(Object.values(files));
            }
            excalidrawAPI.updateScene({
              elements,
              appState: {
                ...snapshot.appState,
                collaborators: undefined,
              },
              captureUpdate: CaptureUpdateAction.NEVER,
            });
            return;
          }
          if (previewBackupRef.current) {
            excalidrawAPI.updateScene({
              elements: previewBackupRef.current.elements as any[],
              appState: previewBackupRef.current.appState,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
            if (previewBackupRef.current.files) {
              excalidrawAPI.addFiles(
                Object.values(previewBackupRef.current.files),
              );
            }
            previewBackupRef.current = null;
          }
        }}
        onRestore={() => {
          previewBackupRef.current = null;
          window.location.reload();
        }}
      />
    </>
  );
};
