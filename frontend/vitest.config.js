import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: true,
    setupFiles: "./tests/component/support/setupTests.js",
    include: ["tests/component/**/*.test.{js,jsx}"],
  },
});
