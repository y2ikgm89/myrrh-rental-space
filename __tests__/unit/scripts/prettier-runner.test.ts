import { describe, expect, test } from "bun:test";

import {
  createPrettierPlan,
  runPrettierPlan,
  type CommandResult,
} from "../../../scripts/prettier";

function ok(name: string): CommandResult {
  return { name, exitCode: 0, stdout: "", stderr: "" };
}

describe("prettier runner", () => {
  test("defaults to the whole repository when no targets are provided", () => {
    const plan = createPrettierPlan(["--check"]);

    expect(plan.command).toEqual(["bunx", "prettier", "--check", "."]);
  });

  test("uses provided targets without also checking the whole repository", () => {
    const plan = createPrettierPlan([
      "--write",
      "scripts/validate.ts",
      "package.json",
    ]);

    expect(plan.command).toEqual([
      "bunx",
      "prettier",
      "--write",
      "scripts/validate.ts",
      "package.json",
    ]);
  });

  test("runs prettier command and returns its result", async () => {
    const plan = createPrettierPlan(["--check", "scripts/validate.ts"]);
    const seenCommands: string[][] = [];

    const result = await runPrettierPlan(plan, async (name, command) => {
      seenCommands.push([...command]);
      return ok(name);
    });

    expect(result.exitCode).toBe(0);
    expect(seenCommands).toEqual([[...plan.command]]);
  });
});
