import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import * as api from "../../api";
import { insertMermaidDiagram } from "./insertMermaidDiagram";

type UseAiDiagramInput = {
  canEdit: boolean;
  excalidrawAPIRef: MutableRefObject<any>;
};

export const useAiDiagram = ({
  canEdit,
  excalidrawAPIRef,
}: UseAiDiagramInput) => {
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!canEdit) {
      setEnabled(false);
      setIsOpen(false);
      return;
    }
    let active = true;
    void api
      .getAiDiagramStatus()
      .then((status) => {
        if (!active) return;
        setEnabled(status.enabled);
      })
      .catch(() => {
        if (!active) return;
        setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [canEdit]);

  const insert = useCallback(
    async (mermaid: string) => {
      if (!excalidrawAPIRef.current) {
        throw new Error("The drawing is still loading. Try again.");
      }
      return insertMermaidDiagram(excalidrawAPIRef.current, mermaid);
    },
    [excalidrawAPIRef],
  );

  return {
    enabled,
    insert,
    isOpen,
    close: () => setIsOpen(false),
    open: () => setIsOpen(true),
  };
};
