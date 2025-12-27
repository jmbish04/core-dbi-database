#!/usr/bin/env bun
import { spawnSync } from "child_process";
import { resolve } from "path";

const ARGS = process.argv.slice(2);
const ACTION = ARGS[0] || "test";

// Path to src/container directory
const CONTAINER_ROOT = resolve(__dirname, "../src/container");
const IMAGE_NAME = "core-dbi-container:local";

function run(cmd: string, args: string[], cwd = CONTAINER_ROOT) {
  console.log(
    `\n\x1b[34m[ContainerManager] Running: ${cmd} ${args.join(" ")}\x1b[0m`,
  );
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd });
  if (res.status !== 0) {
    console.error(
      `\x1b[31m[Error] Command failed with exit code ${res.status}\x1b[0m`,
    );
    process.exit(res.status || 1);
  }
}

switch (ACTION) {
  case "build":
    run("docker", ["build", "-t", IMAGE_NAME, "."]);
    break;

  case "test":
    // Build first ensuring we test latest code
    run("docker", ["build", "-t", IMAGE_NAME, "."]);
    console.log("\x1b[32m[Test] Running Tests inside Container...\x1b[0m");
    // Run run_tests.py
    run("docker", [
      "run",
      "--rm",
      IMAGE_NAME,
      "python",
      "/workspace/run_tests.py",
    ]);
    break;

  case "dev":
  case "mount":
    // Mounts local directories for rapid iteration (hot reload style)
    run("docker", ["build", "-t", IMAGE_NAME, "."]);
    console.log(
      "\x1b[32m[Dev] Starting Container with mounted volumes...\x1b[0m",
    );
    run("docker", [
      "run",
      "--rm",
      "-it",
      "-v",
      `${resolve(CONTAINER_ROOT, "scripts")}:/workspace/scripts`,
      "-v",
      `${resolve(CONTAINER_ROOT, "tests")}:/workspace/tests`,
      "-v",
      `${resolve(CONTAINER_ROOT, "notebooks")}:/workspace/notebooks`,
      IMAGE_NAME,
      "/bin/bash",
    ]);
    break;

  case "integration":
    run("docker", ["build", "-t", IMAGE_NAME, "."]);
    console.log(
      "\x1b[32m[Integration] Running 126 Colby Street Simulation...\x1b[0m",
    );
    // Execute the specific module script
    // Note: This requires network access if it hits SODA API.
    // Docker usually has network access by default.
    run("docker", [
      "run",
      "--rm",
      IMAGE_NAME,
      "python",
      "scripts/cli.py",
      "--module",
      "permit.addenda",
      "--input",
      "/workspace/tests/fixtures/126_colby.json",
      // Warning: Fixture file needs to exist. We should generate it here or assume it exists.
    ]);
    break;

  default:
    console.log(
      "Usage: bun scripts/manage-container.ts [build|test|dev|integration]",
    );
    process.exit(1);
}
