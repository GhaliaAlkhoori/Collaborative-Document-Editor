import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "../../backend");
const uvicornBinary = path.join(backendDir, "venv/bin/uvicorn");

const child = spawn(
  uvicornBinary,
  ["app.main:app", "--host", "127.0.0.1", "--port", "8001"],
  {
    cwd: backendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      AI_MOCK_MODE: process.env.AI_MOCK_MODE || "true",
    },
  }
);

const stopChild = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));
process.on("exit", () => stopChild("SIGTERM"));

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
