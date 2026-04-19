import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import LoginPage from "../../../src/pages/LoginPage";
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
 * Verifies the login form stores the returned auth payload by mocking the API
 * response and submitting valid credentials through the rendered controls.
 */
test("stores the access token and user payload after a successful login", async () => {
  const user = userEvent.setup();
  apiMock.post.mockResolvedValueOnce({
    data: {
      access_token: "token-123",
      user_id: "user-123",
      name: "Alice Writer",
    },
  });

  renderWithAuth(<LoginPage />);

  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "secret-pass-123");
  await user.click(screen.getByRole("button", { name: "Login" }));

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith("/api/v1/auth/login", {
      email: "alice@example.com",
      password: "secret-pass-123",
    });
  });

  expect(localStorage.getItem("access_token")).toBe("token-123");
  expect(JSON.parse(localStorage.getItem("user"))).toEqual({
    user_id: "user-123",
    name: "Alice Writer",
    email: "alice@example.com",
  });
});

/**
 * Verifies login failures surface a friendly inline error by rejecting the
 * mocked API request and asserting on the rendered message.
 */
test("shows an inline error when login fails", async () => {
  const user = userEvent.setup();
  apiMock.post.mockRejectedValueOnce({
    response: {
      data: {
        detail: "Invalid email or password",
      },
    },
  });

  renderWithAuth(<LoginPage />);

  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong-pass-123");
  await user.click(screen.getByRole("button", { name: "Login" }));

  expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
});
