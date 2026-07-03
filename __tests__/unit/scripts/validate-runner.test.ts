import { describe, expect, test } from "bun:test";

import {
  createValidatePlan,
  runValidatePlan,
  type CommandResult,
} from "../../../scripts/validate";

function ok(name: string): CommandResult {
  return { name, exitCode: 0, stdout: "", stderr: "" };
}

function fail(name: string): CommandResult {
  return { name, exitCode: 1, stdout: "", stderr: "failed" };
}

describe("validate runner", () => {
  test("starts type-check and lint together", async () => {
    const plan = createValidatePlan();
    const started: string[] = [];
    const parallelStarted: string[] = [];
    let releaseParallel = () => {};
    const parallelGate = new Promise<void>((resolve) => {
      releaseParallel = resolve;
    });

    const result = await runValidatePlan(plan, async (name) => {
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
    expect(new Set(parallelStarted)).toEqual(new Set(["type-check", "lint"]));
  });

  test("returns failure after collecting both command results", async () => {
    const plan = createValidatePlan();
    const completed: string[] = [];

    const result = await runValidatePlan(plan, async (name) => {
      completed.push(name);
      return name === "lint" ? fail(name) : ok(name);
    });

    expect(result.exitCode).toBe(1);
    expect(completed.sort()).toEqual(["lint", "type-check"]);
    expect(result.results.map((command) => command.name).sort()).toEqual([
      "lint",
      "type-check",
    ]);
  });
});
