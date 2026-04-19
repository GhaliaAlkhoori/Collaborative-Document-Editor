import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import AIEditPanel from "../../../src/components/AIEditPanel";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    defaults: {
      baseURL: "http://127.0.0.1:8001",
    },
  },
}));

vi.mock("../../../src/api/client", () => ({
  default: apiMock,
}));

function createStreamingResponse(chunks) {
  let index = 0;

  return {
    ok: true,
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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
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
      authToken="token-123"
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
      authToken="token-123"
      documentText="Short source text"
      selectedText=""
      onApplySuggestion={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "Generate Suggestion" }));

  expect(await screen.findByText("AI request failed.")).toBeInTheDocument();
});
