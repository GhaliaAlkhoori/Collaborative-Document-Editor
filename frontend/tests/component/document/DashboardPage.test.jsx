import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import DashboardPage from "../../../src/pages/DashboardPage";
import { renderWithAuth } from "../support/renderWithAuth";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: {
      baseURL: "http://127.0.0.1:8001",
    },
  },
}));

vi.mock("../../../src/api/client", () => ({
  default: apiMock,
}));

beforeEach(() => {
  apiMock.post.mockReset();
  apiMock.get.mockReset();
  apiMock.delete.mockReset();
});

/**
 * Verifies the dashboard fetches accessible documents on mount and renders the
 * returned titles and roles so users can see what they can open.
 */
test("loads and displays the current user's accessible documents", async () => {
  apiMock.get.mockResolvedValueOnce({
    data: {
      documents: [
        {
          document_id: "doc-1",
          title: "Project Plan",
          role: "owner",
        },
        {
          document_id: "doc-2",
          title: "Shared Notes",
          role: "editor",
        },
      ],
    },
  });

  renderWithAuth(<DashboardPage />, { token: "token-123" });

  expect(await screen.findByText("Project Plan")).toBeInTheDocument();
  expect(screen.getByText("Shared Notes")).toBeInTheDocument();
  expect(screen.getByText("Role: owner")).toBeInTheDocument();
  expect(screen.getByText("Role: editor")).toBeInTheDocument();
});

/**
 * Verifies creating a document posts the new title with the stored bearer token
 * by typing into the form and asserting on the mocked API call.
 */
test("creates a new document with the current bearer token", async () => {
  const user = userEvent.setup();
  apiMock.get.mockResolvedValueOnce({
    data: {
      documents: [],
    },
  });
  apiMock.post.mockResolvedValueOnce({
    data: {
      document_id: "doc-123",
    },
  });

  renderWithAuth(<DashboardPage />, { token: "token-123" });

  await user.type(screen.getByPlaceholderText("Document title"), "Launch Checklist");
  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith(
      "/api/v1/documents",
      { title: "Launch Checklist" },
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
  });
});

/**
 * Verifies owners can delete documents from the dashboard by clicking the card
 * action, calling the delete API with the bearer token, and removing the card
 * from the rendered list without opening the editor route.
 */
test("deletes an owned document from the dashboard", async () => {
  const user = userEvent.setup();
  apiMock.get.mockResolvedValueOnce({
    data: {
      documents: [
        {
          document_id: "doc-1",
          title: "Project Plan",
          role: "owner",
        },
        {
          document_id: "doc-2",
          title: "Shared Notes",
          role: "editor",
        },
      ],
    },
  });
  apiMock.delete.mockResolvedValueOnce({
    data: {
      document_id: "doc-1",
    },
  });

  renderWithAuth(<DashboardPage />, { token: "token-123" });

  expect(await screen.findByText("Project Plan")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(apiMock.delete).toHaveBeenCalledWith("/api/v1/documents/doc-1", {
      headers: {
        Authorization: "Bearer token-123",
      },
    });
  });

  expect(screen.queryByText("Project Plan")).not.toBeInTheDocument();
  expect(screen.getByText("Document deleted.")).toBeInTheDocument();
  expect(screen.getByText("Shared Notes")).toBeInTheDocument();
});
