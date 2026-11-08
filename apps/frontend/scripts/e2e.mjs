import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const frontendDir = fileURLToPath(new URL("../", import.meta.url));
const composeArgs = ["compose", "--project-name", "absensi-smpi-e2e", "--file", "../../docker-compose.e2e.yml"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: frontendDir,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
}

function compose(...args) {
  run("docker", [...composeArgs, ...args]);
}

async function waitForBackend() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:18001/health");
      if (response.ok && (await response.json()).status === "ok") return;
    } catch {
      await delay(1000);
    }
  }
  throw new Error("E2E backend did not become ready at http://127.0.0.1:18001.");
}

function prepareStack() {
  compose("down", "--remove-orphans");
  compose("up", "--detach", "db");
  compose("build", "backend");
  compose("run", "--rm", "backend", "alembic", "upgrade", "head");
  compose("run", "--rm", "backend", "python", "scripts/seed_e2e.py");
  compose("up", "--detach", "backend");
}

const action = process.argv[2] || "test";
if (action === "down") {
  compose("down", "--remove-orphans");
} else if (action === "up") {
  prepareStack();
  await waitForBackend();
  console.log("E2E stack is ready. Run `npx playwright test` from apps/frontend.");
} else if (action === "test") {
  let exitCode = 1;
  try {
    prepareStack();
    await waitForBackend();
    try {
      run("npx", ["playwright", "test", ...process.argv.slice(3)]);
      exitCode = 0;
    } catch (error) {
      if (error.message.includes("exited with status")) exitCode = 1;
      else throw error;
    }
  } finally {
    compose("down", "--remove-orphans");
  }
  process.exitCode = exitCode;
} else {
  throw new Error(`Unknown E2E action: ${action}`);
}
