import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

vi.mock("../../../src/components/AIEditPanel", () => ({
  default: ({ canUndoLastApply, onApplySuggestion, onUndoLastApply, selectedText }) => (
    <div>
      <div>AI panel mock</div>
      <div>Selected text: {selectedText || "(none)"}</div>
      <button
        type="button"
        onClick={() =>
          onApplySuggestion({
            suggestion: "AI revised content",
            sourceText: "Initial content",
          })
        }
      >
        Apply AI suggestion
      </button>
      {canUndoLastApply ? (
        <button type="button" onClick={() => onUndoLastApply?.()}>
          Undo AI suggestion
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("../../../src/components/RichTextEditor", () => ({
  default: ({ value, onChange, onSelectionChange, readOnly, remoteParticipants }) => (
    <div>
      <div>Rich text editor</div>
      <div>{readOnly ? "Read only rich text" : "Editable rich text"}</div>
      <div>{value}</div>
      <div>Remote rich participants: {remoteParticipants.length}</div>
      <button type="button" onClick={() => onChange("<h1>Formatted draft</h1>")}>
        Apply rich formatting
      </button>
      <button
        type="button"
        onClick={() =>
          onSelectionChange?.({
            start: 3,
            end: 18,
            text: "Initial content",
            mode: "rich",
          })
        }
      >
        Select rich text
      </button>
    </div>
  ),
}));

class MockWebSocket {
  static OPEN = 1;

  static CLOSED = 3;

  static instances = [];

  static initPayloadQueue = [];

  static reset() {
    MockWebSocket.instances = [];
    MockWebSocket.initPayloadQueue = [];
  }

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.sent = [];
    MockWebSocket.instances.push(this);

    const nextInitPayload = MockWebSocket.initPayloadQueue.shift() || {
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
      operation_history: [],
      participants: [],
    };
    this.clientId = nextInitPayload.client_id;

    window.setTimeout(() => {
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify(nextInitPayload),
      });
      this.onmessage?.({
        data: JSON.stringify({
          type: "presence_snapshot",
          participants: nextInitPayload.participants || [],
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
            client_id: this.clientId,
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
  MockWebSocket.reset();
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

afterEach(() => {
  vi.useRealTimers();
});

async function flushTimers(delay) {
  await act(async () => {
    if (typeof delay === "number") {
      await vi.advanceTimersByTimeAsync(delay);
      return;
    }

    await vi.runOnlyPendingTimersAsync();
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
  });
}

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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
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
 * Verifies live source edits are automatically snapshot-saved after their
 * websocket operation is acknowledged, without requiring the user to click save.
 */
test("auto-saves synced source edits after the realtime operation is acknowledged", async () => {
  vi.useFakeTimers();

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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.patch.mockResolvedValueOnce({
    data: {
      version: 3,
      updated_at: "2026-04-20T00:03:00Z",
    },
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });
  await flushTimers();
  await flushAsyncWork();
  await flushTimers();

  expect(screen.getByText("Connected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Source collaboration" }));

  const editor = screen.getByPlaceholderText("Start writing here...");
  fireEvent.change(editor, {
    target: {
      value: "Initial content updated",
      selectionStart: 23,
      selectionEnd: 23,
    },
  });

  await flushTimers();
  await flushTimers(1400);

  expect(apiMock.patch).toHaveBeenCalledWith(
    "/api/v1/documents/doc-123",
    {
      title: "Realtime Plan",
      content: "Initial content updated",
      base_version: 2,
    },
    {
      headers: {
        Authorization: "Bearer token-123",
      },
    }
  );
}, 15000);

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
              username: "editor-user",
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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
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

  await user.type(
    screen.getByPlaceholderText("name@example.com or username"),
    "editor@example.com"
  );
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
 * Verifies the sharing form also supports usernames by submitting a username,
 * posting the username payload shape, and keeping the owner-side success flow.
 */
test("grants document access to a collaborator by username", async () => {
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
              username: "owner",
              email: "owner@example.com",
            },
            {
              user_id: "editor-2",
              role: "editor",
              name: "Editor User",
              username: "editor-user",
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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.post.mockResolvedValueOnce({
    data: {
      document_id: "doc-123",
      user_id: "editor-2",
      username: "editor-user",
      role: "editor",
      granted_at: "2026-04-20T00:02:00Z",
    },
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByText("Share with a collaborator")).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText("name@example.com or username"), "editor-user");
  await user.selectOptions(screen.getByDisplayValue("Viewer access"), "editor");
  await user.click(screen.getByRole("button", { name: "Grant access" }));

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith(
      "/api/v1/documents/doc-123/share",
      {
        username: "editor-user",
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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
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

/**
 * Verifies highlighting text inside the rich editor updates the AI panel
 * source selection so the assistant works from the formatted selection too.
 */
test("uses highlighted rich text as the AI selection source", async () => {
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
          versions: [],
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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByText("Rich text editor")).toBeInTheDocument();
  expect(screen.getByText("Selected text: (none)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Select rich text" }));

  expect(await screen.findByText("Selected text: Initial content")).toBeInTheDocument();
});

/**
 * Verifies the editor sidebar renders document-scoped AI history entries with
 * their status and recorded response previews after loading the history API.
 */
test("shows the logged AI history for the current document", async () => {
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
          versions: [],
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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [
            {
              interaction_id: "ai-1",
              document_id: "doc-123",
              user_id: "owner-1",
              action: "rewrite",
              status: "accepted",
              selected_text: "Original section text",
              prompt: "Rewrite the section.",
              model: "mock-ai-provider",
              response_text: "Suggested section text",
              reviewed_text: "Reviewed section text",
              created_at: "2026-04-20T00:02:00Z",
              updated_at: "2026-04-20T00:03:00Z",
            },
          ],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByText("AI history")).toBeInTheDocument();
  expect(await screen.findByText("rewrite · Accepted")).toBeInTheDocument();
  expect(screen.getByText(/Source: Original section text/)).toBeInTheDocument();
  expect(screen.getByText(/Response: Reviewed section text/)).toBeInTheDocument();
});

/**
 * Verifies the presence chips render realtime activity labels so collaborators
 * are shown as typing or active instead of only appearing in a plain online list.
 */
test("shows collaborator typing activity in the presence chips", async () => {
  MockWebSocket.initPayloadQueue.push({
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
    operation_history: [],
    participants: [
      {
        client_id: "client-1",
        user_id: "owner-1",
        name: "Owner",
        email: "owner@example.com",
        role: "owner",
        selection_start: 0,
        selection_end: 0,
        is_typing: false,
        activity_status: "active",
      },
      {
        client_id: "client-2",
        user_id: "editor-2",
        name: "Editor User",
        email: "editor@example.com",
        role: "editor",
        selection_start: 4,
        selection_end: 9,
        is_typing: true,
        activity_status: "typing",
      },
    ],
  });

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
          versions: [],
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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });

  expect(await screen.findByText("Editor User")).toBeInTheDocument();
  expect(screen.getByText("typing")).toBeInTheDocument();
});

/**
 * Verifies offline edits stay editable during a disconnect, then re-sync and
 * auto-save once the websocket reconnects and the queued operation is replayed.
 */
test("replays offline edits after reconnect and auto-saves the synced draft", async () => {
  vi.useFakeTimers();

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

    if (url === "/api/v1/ai/documents/doc-123/history") {
      return Promise.resolve({
        data: {
          interactions: [],
        },
      });
    }

    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  apiMock.patch.mockResolvedValueOnce({
    data: {
      version: 3,
      updated_at: "2026-04-20T00:06:00Z",
    },
  });

  renderWithAuth(<EditorPage />, { token: "token-123" });
  await flushTimers();
  await flushAsyncWork();
  await flushTimers();

  expect(screen.getByText("Connected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Source collaboration" }));

  MockWebSocket.initPayloadQueue.push({
    type: "init",
    client_id: "client-2",
    document: {
      document_id: "doc-123",
      title: "Realtime Plan",
      content: "Initial content",
      version: 1,
      updated_at: "2026-04-20T00:00:00Z",
      role: "owner",
    },
    operation_history: [],
    participants: [],
  });

  await act(async () => {
    MockWebSocket.instances[0].close();
    MockWebSocket.instances[0].onclose?.();
  });

  const editor = screen.getByPlaceholderText("Start writing here...");
  fireEvent.change(editor, {
    target: {
      value: "Offline draft update",
      selectionStart: 20,
      selectionEnd: 20,
    },
  });
  expect(screen.getByText("Offline mode. Changes will sync when reconnected.")).toBeInTheDocument();

  await flushTimers(1600);
  await flushAsyncWork();
  await flushTimers();
  await flushTimers(1400);

  expect(apiMock.patch).toHaveBeenCalledWith(
    "/api/v1/documents/doc-123",
    {
      title: "Realtime Plan",
      content: "Offline draft update",
      base_version: 2,
    },
    {
      headers: {
        Authorization: "Bearer token-123",
      },
    }
  );

  expect(screen.getByText("All changes auto-saved")).toBeInTheDocument();
}, 15000);
