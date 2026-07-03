import { describe, expect, test } from "bun:test";

import {
  createLintFormatPlan,
  runLintFormatPlan,
  type CommandResult,
} from "../../../scripts/lint-format";

function ok(name: string): CommandResult {
  return { name, exitCode: 0, stdout: "", stderr: "" };
}

function fail(name: string): CommandResult {
  return { name, exitCode: 1, stdout: "", stderr: "failed" };
}

describe("lint-format runner", () => {
  test("starts format check and lint together", async () => {
    const plan = createLintFormatPlan();
    const started: string[] = [];
    const parallelStarted: string[] = [];
    let releaseParallel = () => {};
    const parallelGate = new Promise<void>((resolve) => {
      releaseParallel = resolve;
    });

    const result = await runLintFormatPlan(plan, async (name) => {
      started.push(name);
      parallelStarted.push(name);
      if (parallelStarted.length === plan.parallel.length) {
        releaseParallel();
      }
      await parallelGate;
      return ok(name);
    });

    expect(result.exitCode).toBe(0);
    expect(started).toEqual(plan.parallel.map((command) => command.name));
    expect(new Set(parallelStarted)).toEqual(new Set(["format:check", "lint"]));
  });

  test("returns failure after collecting both command results", async () => {
    const plan = createLintFormatPlan();
    const completed: string[] = [];

    const result = await runLintFormatPlan(plan, async (name) => {
      completed.push(name);
      return name === "format:check" ? fail(name) : ok(name);
    });

    expect(result.exitCode).toBe(1);
    expect(completed.sort()).toEqual(["format:check", "lint"]);
    expect(result.results.map((command) => command.name).sort()).toEqual([
      "format:check",
      "lint",
    ]);
  });
});
