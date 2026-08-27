import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateDiagramDialog } from "./GenerateDiagramDialog";

const { generateAiDiagram, toastSuccess } = vi.hoisted(() => ({
  generateAiDiagram: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("../api", () => ({
  generateAiDiagram,
  isAxiosError: () => false,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess },
}));

describe("GenerateDiagramDialog", () => {
  beforeEach(() => {
    generateAiDiagram.mockReset();
    toastSuccess.mockReset();
  });

  it("generates and inserts a diagram from the entered prompt", async () => {
    generateAiDiagram.mockResolvedValue({
      mermaid: "flowchart LR\nA --> B",
      model: "gemini-test",
    });
    const onInsert = vi.fn().mockResolvedValue(4);
    const onClose = vi.fn();
    render(
      <GenerateDiagramDialog
        isOpen
        onClose={onClose}
        onInsert={onInsert}
      />,
    );
    expect(screen.queryByText("gemini-test")).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("What should the diagram explain?"),
      { target: { value: "Show the customer login flow" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate and insert" }),
    );

    await waitFor(() => {
      expect(generateAiDiagram).toHaveBeenCalledWith(
        "Show the customer login flow",
      );
      expect(onInsert).toHaveBeenCalledWith("flowchart LR\nA --> B");
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Inserted 4 editable diagram elements",
    );
  });

  it("submits prompts longer than 4,000 characters without truncating", async () => {
    generateAiDiagram.mockResolvedValue({
      mermaid: "flowchart LR\nA --> B",
      model: "gemini-test",
    });
    const prompt = `Show this system: ${"step ".repeat(1_000)}done`;
    render(
      <GenerateDiagramDialog
        isOpen
        onClose={vi.fn()}
        onInsert={vi.fn().mockResolvedValue(2)}
      />,
    );

    const input = screen.getByLabelText("What should the diagram explain?");
    expect(input).not.toHaveAttribute("maxlength");
    fireEvent.change(input, { target: { value: prompt } });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate and insert" }),
    );

    await waitFor(() => expect(generateAiDiagram).toHaveBeenCalledWith(prompt));
  });

  it("retries once when the generated Mermaid cannot be parsed", async () => {
    generateAiDiagram
      .mockResolvedValueOnce({ mermaid: "flowchart bad", model: "gemini-test" })
      .mockResolvedValueOnce({
        mermaid: "flowchart LR\nA --> B",
        model: "gemini-test",
      });
    const onInsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("Parse error"))
      .mockResolvedValueOnce(2);
    render(
      <GenerateDiagramDialog
        isOpen
        onClose={vi.fn()}
        onInsert={onInsert}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("What should the diagram explain?"),
      { target: { value: "Show the order processing flow" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate and insert" }),
    );

    await waitFor(() => expect(generateAiDiagram).toHaveBeenCalledTimes(2));
    expect(onInsert).toHaveBeenCalledTimes(2);
    expect(onInsert).toHaveBeenLastCalledWith("flowchart LR\nA --> B");
    expect(generateAiDiagram).toHaveBeenNthCalledWith(
      2,
      "Show the order processing flow\n\nReturn strict Mermaid. Use no edge-label colons in flowcharts.",
    );
  });

  it("keeps the prompt and shows a recoverable error", async () => {
    generateAiDiagram.mockRejectedValue(new Error("Gemini is unavailable"));
    render(
      <GenerateDiagramDialog
        isOpen
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    const prompt = screen.getByLabelText("What should the diagram explain?");
    fireEvent.change(prompt, {
      target: { value: "Show the customer login flow" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate and insert" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gemini is unavailable",
    );
    expect(prompt).toHaveValue("Show the customer login flow");
  });
});
