import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

class MockResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

const originalLocation = window.location;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  global.ResizeObserver = MockResizeObserver;
  delete window.location;
  window.location = {
    ...originalLocation,
    origin: "http://localhost",
    href: "http://localhost/",
    pathname: "/",
    assign: vi.fn(),
    replace: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.location;
  window.location = originalLocation;
});
