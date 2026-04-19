import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import ShareLinkPage from "../../../src/pages/ShareLinkPage";

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
  window.history.replaceState({}, "", "/share/share-token-123");
  window.location.pathname = "/share/share-token-123";
  window.location.href = "http://localhost/share/share-token-123";
});

/**
 * Verifies public share links load their preview, persist the pending token,
 * and present sign-in actions when the visitor is not authenticated yet.
 */
test("shows share-link preview and sign-in actions for unauthenticated visitors", async () => {
  const user = userEvent.setup();
  apiMock.get.mockResolvedValueOnce({
    data: {
      title: "Team Draft",
      role: "viewer",
      is_active: true,
    },
  });

  render(<ShareLinkPage />);

  expect(await screen.findByText("Team Draft")).toBeInTheDocument();
  expect(screen.getByText("Sign in to redeem this share link.")).toBeInTheDocument();
  expect(localStorage.getItem("pending_share_token")).toBe("share-token-123");

  await user.click(screen.getByRole("button", { name: "Sign in to continue" }));

  expect(window.location.href).toBe("/login");
});

/**
 * Verifies authenticated visitors auto-redeem a valid share link by mocking
 * both preview and redeem API calls, then asserting the document redirect fires.
 */
test("redeems a valid share link and redirects authenticated users", async () => {
  localStorage.setItem("access_token", "token-123");
  localStorage.setItem("pending_share_token", "share-token-123");
  apiMock.get.mockResolvedValueOnce({
    data: {
      title: "Team Draft",
      role: "editor",
      is_active: true,
    },
  });
  apiMock.post.mockResolvedValueOnce({
    data: {
      document_id: "doc-789",
    },
  });

  render(<ShareLinkPage />);

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith(
      "/api/v1/share-links/share-token-123/redeem",
      {},
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
  });

  expect(localStorage.getItem("pending_share_token")).toBeNull();
  expect(window.location.replace).toHaveBeenCalledWith("/documents/doc-789");
});

/**
 * Verifies invalid or expired links surface the backend detail by rejecting the
 * preview request and asserting the error state shown to the visitor.
 */
test("shows an error when the share link cannot be opened", async () => {
  apiMock.get.mockRejectedValueOnce({
    response: {
      data: {
        detail: "Share link expired",
      },
    },
  });

  render(<ShareLinkPage />);

  expect(await screen.findByText("Share link expired")).toBeInTheDocument();
  expect(screen.queryByText("Checking link...")).not.toBeInTheDocument();
});
