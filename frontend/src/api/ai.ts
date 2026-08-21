import { api } from "./client";

export type AiDiagramStatus = {
  enabled: boolean;
  model: string | null;
};

export type GeneratedDiagram = {
  mermaid: string;
  model: string;
};

export const getAiDiagramStatus = async (): Promise<AiDiagramStatus> => {
  const response = await api.get<AiDiagramStatus>("/ai/diagram/status");
  return response.data;
};

export const generateAiDiagram = async (
  prompt: string,
): Promise<GeneratedDiagram> => {
  const response = await api.post<GeneratedDiagram>("/ai/diagram", { prompt });
  return response.data;
};
