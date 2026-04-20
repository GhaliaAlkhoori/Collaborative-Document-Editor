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
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
});

/**
 * Verifies the dashboard fetches accessible documents on mount and renders the
 * returned titles and roles so users can see what they can open.
 */
test("loads and displays the current user's accessible documents", async () => {
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents") {
      return Promise.resolve({
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
    }

    if (url === "/api/v1/invitations") {
      return Promise.resolve({
        data: {
          invitations: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  renderWithAuth(<DashboardPage />, {
    token: "token-123",
    user: {
      username: "owner-user",
    },
  });

  expect(await screen.findByText("Project Plan")).toBeInTheDocument();
  expect(screen.getByText("Shared Notes")).toBeInTheDocument();
  expect(screen.getByText("Role: owner")).toBeInTheDocument();
  expect(screen.getByText("Role: editor")).toBeInTheDocument();
  expect(screen.getByText("@owner-user")).toBeInTheDocument();
  expect(screen.getByText("Shared with you")).toBeInTheDocument();
});

/**
 * Verifies creating a document posts the new title with the stored bearer token
 * by typing into the form and asserting on the mocked API call.
 */
test("creates a new document with the current bearer token", async () => {
  const user = userEvent.setup();
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents") {
      return Promise.resolve({
        data: {
          documents: [],
        },
      });
    }

    if (url === "/api/v1/invitations") {
      return Promise.resolve({
        data: {
          invitations: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
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
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents") {
      return Promise.resolve({
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
    }

    if (url === "/api/v1/invitations") {
      return Promise.resolve({
        data: {
          invitations: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
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

/**
 * Verifies invited users see newly shared documents in the invite inbox and
 * mark the invite as seen before navigating into the document.
 */
test("shows recent invites and marks them seen when opened", async () => {
  const user = userEvent.setup();
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents") {
      return Promise.resolve({
        data: {
          documents: [
            {
              document_id: "doc-2",
              title: "Shared Notes",
              role: "editor",
            },
          ],
        },
      });
    }

    if (url === "/api/v1/invitations") {
      return Promise.resolve({
        data: {
          invitations: [
            {
              invitation_id: "invite-1",
              document_id: "doc-2",
              title: "Shared Notes",
              role: "editor",
              sender_user_id: "owner-1",
              sender_name: "Owner",
              sender_username: "owner-user",
              created_at: "2026-04-20T00:00:00Z",
              seen_at: null,
            },
          ],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.patch.mockResolvedValueOnce({
    data: {
      invitation_id: "invite-1",
      seen_at: "2026-04-20T00:05:00Z",
    },
  });

  renderWithAuth(<DashboardPage />, {
    token: "token-123",
    user: {
      username: "editor-user",
    },
  });

  expect(await screen.findByText("Recent invites")).toBeInTheDocument();
  expect(screen.getByText("New invite")).toBeInTheDocument();
  expect(screen.getByText(/Shared by Owner \(@owner-user\) as editor\./)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Open invited document" }));

  await waitFor(() => {
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/api/v1/invitations/invite-1/seen",
      {},
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
  });

  expect(window.location.href).toBe("/documents/doc-2");
});
