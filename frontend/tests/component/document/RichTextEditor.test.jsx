import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import RichTextEditor from "../../../src/components/RichTextEditor";

/**
 * Verifies the rich-text editor renders remote collaborator highlights by
 * passing rich-selection participants and asserting their label and decoration appear.
 */
test("renders remote collaborator highlights in rich text mode", async () => {
  const { container } = render(
    <RichTextEditor
      value="<p>Initial content for testing</p>"
      onChange={() => {}}
      onSelectionChange={() => {}}
      remoteParticipants={[
        {
          client_id: "client-2",
          name: "Editor User",
          username: "editor-user",
          color: "#2563eb",
          selection_mode: "rich",
          selection_start: 2,
          selection_end: 9,
        },
      ]}
    />
  );

  expect(await screen.findByText("Editor User")).toBeInTheDocument();

  await waitFor(() => {
    expect(container.querySelector(".remote-rich-selection")).not.toBeNull();
    expect(container.querySelector(".remote-rich-caret")).not.toBeNull();
  });
});
