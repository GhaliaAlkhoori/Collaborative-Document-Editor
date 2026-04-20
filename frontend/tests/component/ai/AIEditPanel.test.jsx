import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import AIEditPanel from "../../../src/components/AIEditPanel";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    patch: vi.fn(),
    defaults: {
      baseURL: "http://127.0.0.1:8001",
    },
  },
}));

vi.mock("../../../src/api/client", () => ({
  default: apiMock,
  fetchWithAuth: (...args) => fetch(...args),
}));

function createStreamingResponse(chunks, interactionId = "interaction-1") {
  let index = 0;

  return {
    ok: true,
    headers: {
      get(name) {
        return name?.toLowerCase() === "x-ai-interaction-id" ? interactionId : null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }

            const encoder = new TextEncoder();
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
}

function mockAbortableStreamingResponse(firstChunk) {
  fetch.mockImplementationOnce((_url, options = {}) =>
    Promise.resolve({
      ok: true,
      headers: {
        get(name) {
          return name?.toLowerCase() === "x-ai-interaction-id" ? "interaction-cancel" : null;
        },
      },
      body: {
        getReader() {
          let hasDeliveredFirstChunk = false;

          return {
            async read() {
              if (!hasDeliveredFirstChunk) {
                hasDeliveredFirstChunk = true;
                return {
                  done: false,
                  value: new TextEncoder().encode(firstChunk),
                };
              }

              return new Promise((_resolve, reject) => {
                const abortError = Object.assign(new Error("The operation was aborted."), {
                  name: "AbortError",
                });

                if (options.signal?.aborted) {
                  reject(abortError);
                  return;
                }

                options.signal?.addEventListener(
                  "abort",
                  () => {
                    reject(abortError);
                  },
                  { once: true }
                );
              });
            },
          };
        },
      },
    })
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  apiMock.patch.mockReset();
  apiMock.patch.mockResolvedValue({ data: {} });
});

/**
 * Verifies AI review supports partial acceptance by streaming a suggestion,
 * rejecting one change block, and asserting that the applied output is merged correctly.
 */
test("streams a suggestion and applies a partially accepted result", async () => {
  const user = userEvent.setup();
  const onApplySuggestion = vi.fn();
  const sourceText = "This draft needs better structure.";
  const rejectedLeadIn = "This revised version presents the same ideas with a more polished tone.";
  const acceptedClosing = "The revised draft keeps the original meaning while sounding more polished.";

  fetch.mockResolvedValueOnce(
    createStreamingResponse([
      `${rejectedLeadIn}\n\n`,
      `${sourceText}\n\n`,
      acceptedClosing,
    ])
  );

  render(
    <AIEditPanel
      documentId="doc-123"
      documentText={sourceText}
      selectedText=""
      onApplySuggestion={onApplySuggestion}
    />
  );

  await user.click(screen.getByRole("button", { name: "Generate Suggestion" }));

  expect(await screen.findByText("Change 1")).toBeInTheDocument();
  expect(screen.getByText("Change 2")).toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "Keep original" })[0]);
  await user.click(screen.getByRole("button", { name: "Apply reviewed version" }));

  await waitFor(() => {
    expect(onApplySuggestion).toHaveBeenCalledWith({
      suggestion: `${sourceText}\n\n${acceptedClosing}`,
      sourceText,
    });
  });
  expect(apiMock.patch).toHaveBeenCalledWith("/api/v1/ai/history/interaction-1", {
    document_id: "doc-123",
    status: "accepted",
    reviewed_text: `${sourceText}\n\n${acceptedClosing}`,
  });
});

/**
 * Verifies AI failures surface a readable inline error by returning a rejected
 * HTTP response and asserting on the rendered message.
 */
test("shows a clear error message when generation fails", async () => {
  const user = userEvent.setup();

  fetch.mockResolvedValueOnce({
    ok: false,
    body: null,
    async json() {
      return {
        detail: "AI request failed.",
      };
    },
  });

  render(
    <AIEditPanel
      documentId="doc-123"
      documentText="Short source text"
      selectedText=""
      onApplySuggestion={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "Generate Suggestion" }));

  expect(await screen.findByText("AI request failed.")).toBeInTheDocument();
});

/**
 * Verifies cancelling generation keeps the streamed partial output available
 * for review by aborting mid-stream and asserting the inline recovery message
 * plus the editable partial suggestion text.
 */
test("keeps partial output available when generation is cancelled", async () => {
  const user = userEvent.setup();
  const partialSuggestion = "Partial rewrite that arrived before cancellation.";

  mockAbortableStreamingResponse(partialSuggestion);

  render(
    <AIEditPanel
      documentId="doc-123"
      documentText="Original paragraph"
      selectedText=""
      onApplySuggestion={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "Generate Suggestion" }));
  expect(await screen.findByText(partialSuggestion)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Cancel generation" }));

  expect(
    await screen.findByText("Generation cancelled. Partial output kept for review.")
  ).toBeInTheDocument();
  expect(screen.getByDisplayValue(partialSuggestion)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(apiMock.patch).toHaveBeenCalledWith("/api/v1/ai/history/interaction-cancel", {
    document_id: "doc-123",
    status: "rejected",
    reviewed_text: partialSuggestion,
  });
});

/**
 * Verifies users can manually edit the reviewed output before applying it and
 * can trigger the undo callback for the last AI apply from the same panel.
 */
test("applies a manually edited suggestion and exposes undo for the last AI apply", async () => {
  const user = userEvent.setup();
  const onApplySuggestion = vi.fn();
  const onUndoLastApply = vi.fn();
  const sourceText = "Original paragraph";
  const generatedSuggestion = "Improved paragraph";
  const editedSuggestion = "Improved paragraph with a final manual touch.";

  fetch.mockResolvedValueOnce(createStreamingResponse([generatedSuggestion]));

  render(
    <AIEditPanel
      documentId="doc-123"
      documentText={sourceText}
      selectedText=""
      canUndoLastApply
      onApplySuggestion={onApplySuggestion}
      onUndoLastApply={onUndoLastApply}
    />
  );

  await user.click(screen.getByRole("button", { name: "Generate Suggestion" }));
  expect(await screen.findByDisplayValue(generatedSuggestion)).toBeInTheDocument();

  const editableOutput = screen.getByDisplayValue(generatedSuggestion);
  await user.clear(editableOutput);
  await user.type(editableOutput, editedSuggestion);
  await user.click(screen.getByRole("button", { name: "Apply reviewed version" }));

  await waitFor(() => {
    expect(onApplySuggestion).toHaveBeenCalledWith({
      suggestion: editedSuggestion,
      sourceText,
    });
  });
  expect(apiMock.patch).toHaveBeenCalledWith("/api/v1/ai/history/interaction-1", {
    document_id: "doc-123",
    status: "accepted",
    reviewed_text: editedSuggestion,
  });

  await user.click(screen.getByRole("button", { name: "Undo last AI apply" }));
  expect(onUndoLastApply).toHaveBeenCalledTimes(1);
});
