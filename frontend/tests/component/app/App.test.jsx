import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  loginPage: () => <div>Mock Login Page</div>,
  registerPage: () => <div>Mock Register Page</div>,
  dashboardPage: () => <div>Mock Dashboard Page</div>,
  editorPage: () => <div>Mock Editor Page</div>,
  shareLinkPage: () => <div>Mock Share Link Page</div>,
}));

vi.mock("../../../src/pages/LoginPage", () => ({
  default: pageMocks.loginPage,
}));

vi.mock("../../../src/pages/RegisterPage", () => ({
  default: pageMocks.registerPage,
}));

vi.mock("../../../src/pages/DashboardPage", () => ({
  default: pageMocks.dashboardPage,
}));

vi.mock("../../../src/pages/EditorPage", () => ({
  default: pageMocks.editorPage,
}));

vi.mock("../../../src/pages/ShareLinkPage", () => ({
  default: pageMocks.shareLinkPage,
}));

import App from "../../../src/App";

function renderAt(path, { token = "", refreshToken = "" } = {}) {
  window.history.replaceState({}, "", path);
  window.location.pathname = path;
  window.location.href = `http://localhost${path}`;
  localStorage.clear();

  if (token) {
    localStorage.setItem("access_token", token);
  }

  if (refreshToken) {
    localStorage.setItem("refresh_token", refreshToken);
  }

  return render(<App />);
}

/**
 * Verifies the app sends unauthenticated users on protected routes back to the
 * login page by spying on history replacement and asserting the login view renders.
 */
test("redirects protected routes to login when no access token is stored", () => {
  const replaceSpy = vi.spyOn(window.history, "replaceState");

  renderAt("/dashboard");

  expect(screen.getByText("Mock Login Page")).toBeInTheDocument();
  expect(replaceSpy).toHaveBeenCalledWith({}, "", "/login");
});

/**
 * Verifies the router allows public share-link entry without auth by rendering
 * the share-link page component for matching share URLs.
 */
test("renders the share-link page for public share routes", () => {
  renderAt("/share/share-token-123");

  expect(screen.getByText("Mock Share Link Page")).toBeInTheDocument();
});

/**
 * Verifies authenticated dashboard routes render the dashboard entry point when
 * a valid token is already present in local storage.
 */
test("renders the dashboard page on authenticated dashboard routes", () => {
  renderAt("/dashboard", { token: "token-123" });

  expect(screen.getByText("Mock Dashboard Page")).toBeInTheDocument();
});

/**
 * Verifies a stored refresh token still counts as an active session for route
 * gating so the app can silently refresh expired access tokens after reload.
 */
test("renders protected routes when only a refresh token is stored", () => {
  renderAt("/dashboard", { refreshToken: "refresh-123" });

  expect(screen.getByText("Mock Dashboard Page")).toBeInTheDocument();
});

/**
 * Verifies unknown authenticated routes still fall back to the not-found state
 * instead of misrouting to another page component.
 */
test("renders the not-found view for unknown authenticated routes", () => {
  renderAt("/missing-page", { token: "token-123" });

  expect(screen.getByText("Page not found")).toBeInTheDocument();
});
