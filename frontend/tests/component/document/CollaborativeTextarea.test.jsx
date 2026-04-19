import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import CollaborativeTextarea from "../../../src/components/CollaborativeTextarea";

function setSelectionRange(node, start, end) {
  Object.defineProperty(node, "selectionStart", {
    configurable: true,
    writable: true,
    value: start,
  });
  Object.defineProperty(node, "selectionEnd", {
    configurable: true,
    writable: true,
    value: end,
  });
}

beforeEach(() => {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    paddingLeft: "20px",
    paddingRight: "20px",
    paddingTop: "18px",
    lineHeight: "24px",
    font: "16px monospace",
    letterSpacing: "0px",
  });
});

/**
 * Verifies the collaborative textarea hides the local participant while still
 * rendering remote collaborator labels, then forwards text edits with the
 * captured cursor selection to the parent callback.
 */
test("renders remote collaborators and reports text changes with selections", () => {
  const textareaRef = createRef();
  const onTextChange = vi.fn();
  const onSelectionChange = vi.fn();

  render(
    <CollaborativeTextarea
      value="Hello world"
      selection={{ start: 0, end: 5 }}
      localClientId="local-1"
      remoteParticipants={[
        {
          client_id: "remote-1",
          name: "Alice",
          color: "#2563eb",
          selection_start: 0,
          selection_end: 5,
        },
        {
          client_id: "local-1",
          name: "Me",
          color: "#7c3aed",
          selection_start: 6,
          selection_end: 11,
        },
      ]}
      readOnly={false}
      textareaRef={textareaRef}
      onTextChange={onTextChange}
      onSelectionChange={onSelectionChange}
    />
  );

  const textbox = screen.getByRole("textbox");
  setSelectionRange(textbox, 11, 11);
  fireEvent.change(textbox, {
    target: {
      value: "Hello world!",
    },
  });

  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.queryByText("Me")).not.toBeInTheDocument();
  expect(onTextChange).toHaveBeenCalledWith("Hello world!", { start: 11, end: 11 });
  expect(onSelectionChange).not.toHaveBeenCalled();
});

/**
 * Verifies cursor movement events emit the latest selection range by setting a
 * controlled selection on the textarea and dispatching a select event.
 */
test("reports selection changes from textarea selection events", () => {
  const textareaRef = createRef();
  const onTextChange = vi.fn();
  const onSelectionChange = vi.fn();

  render(
    <CollaborativeTextarea
      value="Hello world"
      selection={{ start: 0, end: 0 }}
      localClientId="local-1"
      remoteParticipants={[]}
      readOnly={false}
      textareaRef={textareaRef}
      onTextChange={onTextChange}
      onSelectionChange={onSelectionChange}
    />
  );

  const textbox = screen.getByRole("textbox");
  setSelectionRange(textbox, 2, 7);
  fireEvent.select(textbox);

  expect(onSelectionChange).toHaveBeenCalledWith({ start: 2, end: 7 });
  expect(onTextChange).not.toHaveBeenCalled();
});
