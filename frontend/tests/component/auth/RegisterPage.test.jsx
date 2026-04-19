import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import RegisterPage from "../../../src/pages/RegisterPage";

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
});

/**
 * Verifies the registration form posts new-user details and shows the success
 * state before its delayed redirect would send the browser back to login.
 */
test("submits registration details and shows a success message", async () => {
  const user = userEvent.setup();
  apiMock.post.mockResolvedValueOnce({ data: {} });

  render(<RegisterPage />);

  await user.type(screen.getByLabelText("Full Name"), "Alice Writer");
  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "secret-pass-123");
  await user.click(screen.getByRole("button", { name: "Register" }));

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith("/api/v1/auth/register", {
      name: "Alice Writer",
      email: "alice@example.com",
      password: "secret-pass-123",
    });
  });

  expect(
    screen.getByText("Account created successfully. Redirecting to login...")
  ).toBeInTheDocument();
});
