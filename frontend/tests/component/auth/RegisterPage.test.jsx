import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";

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

/**
 * Verifies the success flow performs its delayed redirect by using fake timers
 * and advancing the timeout after the mocked registration request resolves.
 */
test("redirects to login after a successful registration", async () => {
  const timeoutSpy = vi.spyOn(window, "setTimeout");
  apiMock.post.mockResolvedValueOnce({ data: {} });

  render(<RegisterPage />);

  fireEvent.change(screen.getByLabelText("Full Name"), {
    target: { value: "Alice Writer" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "alice@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret-pass-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Register" }));

  await waitFor(() => {
    expect(apiMock.post).toHaveBeenCalledWith("/api/v1/auth/register", {
      name: "Alice Writer",
      email: "alice@example.com",
      password: "secret-pass-123",
    });
  });

  expect(timeoutSpy).toHaveBeenCalled();
  const redirectTimerCall = timeoutSpy.mock.calls.find(([, delay]) => delay === 1200);
  expect(redirectTimerCall).toBeTruthy();
  const [redirectCallback] = redirectTimerCall;
  redirectCallback();

  expect(window.location.href).toBe("/login");
});

/**
 * Verifies registration failures surface the backend message by rejecting the
 * mocked request and asserting that the form renders the returned error text.
 */
test("shows an inline error when registration fails", async () => {
  const user = userEvent.setup();
  apiMock.post.mockRejectedValueOnce({
    response: {
      data: {
        detail: "Email already registered",
      },
    },
  });

  render(<RegisterPage />);

  await user.type(screen.getByLabelText("Full Name"), "Alice Writer");
  await user.type(screen.getByLabelText("Email"), "alice@example.com");
  await user.type(screen.getByLabelText("Password"), "secret-pass-123");
  await user.click(screen.getByRole("button", { name: "Register" }));

  expect(await screen.findByText("Email already registered")).toBeInTheDocument();
});
