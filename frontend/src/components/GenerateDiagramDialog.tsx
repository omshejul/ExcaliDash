import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import * as api from "../api";
import { appear } from "../utils/motion";

type Props = {
  isOpen: boolean;
  model: string | null;
  onClose: () => void;
  onInsert: (mermaid: string) => Promise<number>;
};

const EXAMPLES = [
  "Show a user signing in, calling an API, and reading PostgreSQL",
  "Create a sequence diagram for checkout and payment confirmation",
];

const getErrorMessage = (error: unknown): string => {
  if (api.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not generate the diagram. Try again.";
};

export const GenerateDiagramDialog: React.FC<Props> = ({
  isOpen,
  model,
  onClose,
  onInsert,
}) => {
  const reducedMotion = useReducedMotion();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPrompt("");
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isGenerating) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, isOpen, onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = prompt.trim();
    if (value.length < 8 || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    try {
      const generated = await api.generateAiDiagram(value);
      let insertedCount: number;
      try {
        insertedCount = await onInsert(generated.mermaid);
      } catch {
        const retryPrompt = `${value.slice(
          0,
          3_850,
        )}\n\nReturn strict Mermaid. Use no edge-label colons in flowcharts.`;
        const retry = await api.generateAiDiagram(retryPrompt);
        insertedCount = await onInsert(retry.mermaid);
      }
      toast.success(
        `Inserted ${insertedCount} editable diagram elements`,
      );
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsGenerating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-diagram-title"
          {...appear(reducedMotion)}
        >
          <button
            type="button"
            className="absolute inset-0 bg-neutral-950/35 backdrop-blur-sm"
            aria-label="Close diagram generator"
            onClick={() => {
              if (!isGenerating) onClose();
            }}
          />
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[6px_6px_0_0_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0_0_rgba(255,255,255,0.08)]"
          >
            <div className="flex items-start justify-between gap-4 border-b-2 border-black px-5 py-4 dark:border-neutral-700 sm:px-6">
              <div>
                <h2
                  id="generate-diagram-title"
                  className="text-lg font-bold text-neutral-950 dark:text-white"
                >
                  Generate diagram
                </h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Describe the flow. Gemini will add editable shapes to this drawing.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isGenerating}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-white"
                aria-label="Close diagram generator"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div>
                <label
                  htmlFor="diagram-prompt"
                  className="mb-2 block text-sm font-bold text-neutral-800 dark:text-neutral-200"
                >
                  What should the diagram explain?
                </label>
                <textarea
                  id="diagram-prompt"
                  autoFocus
                  rows={5}
                  maxLength={4_000}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: Show how a customer order moves through checkout, payment, fulfillment, and delivery"
                  className="w-full resize-y rounded-xl border-2 border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none placeholder:text-neutral-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-950"
                />
                <div className="mt-2 flex justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Only this prompt is sent to Gemini.</span>
                  <span className="tabular-nums">{prompt.length}/4,000</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2" aria-label="Prompt examples">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    disabled={isGenerating}
                    className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-left text-xs font-medium text-neutral-700 hover:border-neutral-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {error ? (
                  <motion.div
                    key="error"
                    role="alert"
                    className="flex gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                    {...appear(reducedMotion)}
                  >
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                    <span>{error}</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-4 border-t-2 border-black bg-neutral-50 px-5 py-4 dark:border-neutral-700 dark:bg-neutral-800/50 sm:px-6">
              <span className="hidden text-xs text-neutral-500 dark:text-neutral-400 sm:block">
                {model || "Gemini"}
              </span>
              <div className="ml-auto flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isGenerating}
                  className="min-h-11 rounded-xl border-2 border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-700 hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={prompt.trim().length < 8 || isGenerating}
                  aria-busy={isGenerating}
                  className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-black bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-[2px_2px_0_0_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                >
                  {isGenerating ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  Generate and insert
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};
