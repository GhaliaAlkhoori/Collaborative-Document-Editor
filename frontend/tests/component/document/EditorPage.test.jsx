import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import EditorPage from "../../../src/pages/EditorPage";
import { renderWithAuth } from "../support/renderWithAuth";

const { apiMock, ensureValidAccessTokenMock } = vi.hoisted(() => ({
  apiMock: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    defaults: {
      baseURL: "http://127.0.0.1:8001",
    },
  },
  ensureValidAccessTokenMock: vi.fn(),
}));

vi.mock("../../../src/api/client", () => ({
  default: apiMock,
  ensureValidAccessToken: ensureValidAccessTokenMock,
}));

vi.mock("../../../src/components/RichTextEditor", () => ({
  default: ({ value, onChange, readOnly }) => (
    <div>
      <div>Rich text editor</div>
      <div>{readOnly ? "Read only rich text" : "Editable rich text"}</div>
      <div>{value}</div>
      <button type="button" onClick={() => onChange("<h1>Formatted draft</h1>")}>
        Apply rich formatting
      </button>
    </div>
  ),
}));

class MockWebSocket {
  static OPEN = 1;

  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.sent = [];

    window.setTimeout(() => {
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({
          type: "init",
          client_id: "client-1",
          document: {
            document_id: "doc-123",
            title: "Realtime Plan",
            content: "Initial content",
            version: 1,
            updated_at: "2026-04-20T00:00:00Z",
            role: "owner",
          },
          participants: [],
        }),
      });
      this.onmessage?.({
        data: JSON.stringify({
          type: "presence_snapshot",
          participants: [],
        }),
      });
    }, 0);
  }

  send(message) {
    const parsedMessage = JSON.parse(message);
    this.sent.push(parsedMessage);

    if (parsedMessage.type === "operation") {
      window.setTimeout(() => {
        this.onmessage?.({
          data: JSON.stringify({
            type: "operation_applied",
            client_id: "client-1",
            client_op_id: parsedMessage.client_op_id,
            version: 2,
            updated_at: "2026-04-20T00:01:00Z",
            operation: parsedMessage.operation,
            participants: [],
          }),
        });
      }, 0);
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
  ensureValidAccessTokenMock.mockReset();
  ensureValidAccessTokenMock.mockResolvedValue("token-123");
  vi.stubGlobal("WebSocket", MockWebSocket);
  window.history.replaceState({}, "", "/documents/doc-123");
  window.location.pathname = "/documents/doc-123";
  window.location.href = "http://localhost/documents/doc-123";
});

/**
 * Verifies the editor loads document metadata, connects to the mocked realtime
 * socket, and saves a snapshot through the document API when the user clicks save.
 */
test("loads the editor view and saves a snapshot", async () => {
  const user = userEvent.setup();
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents/doc-123") {
      return Promise.resolve({
        data: {
          title: "Realtime Plan",
          content: "Initial content",
          version: 1,
          updated_at: "2026-04-20T00:00:00Z",
          current_role: "owner",
          collaborators: [],
        },
      });
    }

    if (url === "/api/v1/documents/doc-123/versions") {
      return Promise.resolve({
        data: {
          versions: [
            {
              version: 1,
              title: "Realtime Plan",
              content: "Initial content",
              saved_at: "2026-04-20T00:00:00Z",
            },
          ],
        },
      });
    }

    if (url === "/api/v1/documents/doc-123/share-links") {
      return Promise.resolve({
        data: {
          links: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.patch.mockResolvedValueOnce({
    data: {
      version: 2,
      updated_at: "2026-04-20T00:05:00Z",
    },
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByDisplayValue("Realtime Plan")).toBeInTheDocument();
  expect(await screen.findByText("Create share link")).toBeInTheDocument();
  expect(await screen.findByText("Connected")).toBeInTheDocument();
  expect(screen.getByText("Rich text editor")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save snapshot" }));

  await waitFor(() => {
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/api/v1/documents/doc-123",
      {
        title: "Realtime Plan",
        content: "Initial content",
        base_version: 1,
      },
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
  });
});

/**
 * Verifies owners can share document access by email with a selected role by
 * submitting the sharing form, posting the backend request, and refreshing the
 * collaborator list from the document endpoint.
 */
test("grants document access to a collaborator from the sharing panel", async () => {
  const user = userEvent.setup();
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents/doc-123") {
      return Promise.resolve({
        data: {
          title: "Realtime Plan",
          content: "Initial content",
          version: 1,
          updated_at: "2026-04-20T00:00:00Z",
          current_role: "owner",
          collaborators: [
            {
              user_id: "owner-1",
              role: "owner",
              name: "Owner",
              email: "owner@example.com",
            },
            {
              user_id: "editor-2",
              role: "editor",
              name: "Editor User",
              email: "editor@example.com",
            },
          ],
        },
      });
    }

    if (url === "/api/v1/documents/doc-123/versions") {
      return Promise.resolve({
        data: {
          versions: [
            {
              version: 1,
              title: "Realtime Plan",
              content: "Initial content",
              saved_at: "2026-04-20T00:00:00Z",
            },
          ],
        },
      });
    }

    if (url === "/api/v1/documents/doc-123/share-links") {
      return Promise.resolve({
        data: {
          links: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.post.mockResolvedValueOnce({
    data: {
      document_id: "doc-123",
      user_id: "editor-2",
      role: "editor",
      granted_at: "2026-04-20T00:02:00Z",
    },
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByText("Share with a collaborator")).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText("name@example.com"), "editor@example.com");
  await user.selectOptions(screen.getByDisplayValue("Viewer access"), "editor");
  await user.click(screen.getByRole("button", { name: "Grant access" }));

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith(
      "/api/v1/documents/doc-123/share",
      {
        user_email: "editor@example.com",
        role: "editor",
      },
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
  });

  expect(await screen.findByText("Access granted as editor.")).toBeInTheDocument();
  expect(screen.getByText("Editor User")).toBeInTheDocument();
});

/**
 * Verifies the formatted editor is available in the live document flow by
 * switching between rich and source modes, applying a formatted HTML change,
 * and saving the updated markup through the snapshot API.
 */
test("saves rich text formatting through the document editor", async () => {
  const user = userEvent.setup();
  apiMock.get.mockImplementation((url) => {
    if (url === "/api/v1/documents/doc-123") {
      return Promise.resolve({
        data: {
          title: "Realtime Plan",
          content: "Initial content",
          version: 1,
          updated_at: "2026-04-20T00:00:00Z",
          current_role: "owner",
          collaborators: [],
        },
      });
    }

    if (url === "/api/v1/documents/doc-123/versions") {
      return Promise.resolve({
        data: {
          versions: [
            {
              version: 1,
              title: "Realtime Plan",
              content: "Initial content",
              saved_at: "2026-04-20T00:00:00Z",
            },
          ],
        },
      });
    }

    if (url === "/api/v1/documents/doc-123/share-links") {
      return Promise.resolve({
        data: {
          links: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.patch.mockResolvedValueOnce({
    data: {
      version: 3,
      updated_at: "2026-04-20T00:05:00Z",
    },
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByText("Rich text editor")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Source collaboration" }));
  expect(screen.getByPlaceholderText("Start writing here...")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Rich text" }));
  await user.click(screen.getByRole("button", { name: "Apply rich formatting" }));
  await user.click(screen.getByRole("button", { name: "Save snapshot" }));

  await waitFor(() => {
    expect(apiMock.patch).toHaveBeenCalledWith(
      "/api/v1/documents/doc-123",
      {
        title: "Realtime Plan",
        content: "<h1>Formatted draft</h1>",
        base_version: 2,
      },
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
  });
});
