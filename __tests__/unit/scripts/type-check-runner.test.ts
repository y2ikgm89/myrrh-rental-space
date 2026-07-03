import { describe, expect, test } from "bun:test";

import {
  createTypeCheckPlan,
  runTypeCheckPlan,
  type CommandResult,
} from "../../../scripts/type-check";

function ok(name: string): CommandResult {
  return { name, exitCode: 0, stdout: "", stderr: "" };
}

function fail(name: string): CommandResult {
  return { name, exitCode: 1, stdout: "", stderr: "failed" };
}

describe("type-check runner", () => {
  test("runs setup commands in series before starting app and test tsc checks together", async () => {
    const plan = createTypeCheckPlan();
    const started: string[] = [];
    const parallelStarted: string[] = [];
    let releaseParallel = () => {};
    const parallelGate = new Promise<void>((resolve) => {
      releaseParallel = resolve;
    });

    const run = async (name: string): Promise<CommandResult> => {
      started.push(name);
      if (name.startsWith("tsc:")) {
        parallelStarted.push(name);
        if (parallelStarted.length === plan.parallel.length) {
          releaseParallel();
        }
        await parallelGate;
      }
      return ok(name);
    };

    const result = await runTypeCheckPlan(plan, run);

    expect(result.exitCode).toBe(0);
    expect(started.slice(0, plan.setup.length)).toEqual(
      plan.setup.map((command) => command.name),
    );
    expect(new Set(parallelStarted)).toEqual(
      new Set(plan.parallel.map((command) => command.name)),
    );
  });

  test("stops before tsc checks when setup fails", async () => {
    const plan = createTypeCheckPlan();
    const started: string[] = [];

    const result = await runTypeCheckPlan(plan, async (name) => {
      started.push(name);
      return name === "prisma:generate" ? fail(name) : ok(name);
    });

    expect(result.exitCode).toBe(1);
    expect(started).toEqual(["toolchain:check", "prisma:generate"]);
  });

  test("returns failure after collecting both parallel tsc results", async () => {
    const plan = createTypeCheckPlan();
    const started: string[] = [];

    const result = await runTypeCheckPlan(plan, async (name) => {
      started.push(name);
      return name === "tsc:test" ? fail(name) : ok(name);
    });

    expect(result.exitCode).toBe(1);
    expect(started.filter((name) => name.startsWith("tsc:")).sort()).toEqual([
      "tsc:app",
      "tsc:test",
    ]);
  });
});
