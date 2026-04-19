import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import EditorPage from "../../../src/pages/EditorPage";
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
    this.sent.push(JSON.parse(message));
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
