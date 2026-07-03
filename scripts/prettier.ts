#!/usr/bin/env bun

type PrettierMode = "--check" | "--write";

type PrettierPlan = {
  name: "prettier";
  command: readonly string[];
};

export type CommandResult = {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

type CommandRunner = (
  name: string,
  command: readonly string[],
) => Promise<CommandResult>;

function isPrettierMode(value: string | undefined): value is PrettierMode {
  return value === "--check" || value === "--write";
}

export function createPrettierPlan(args: readonly string[]): PrettierPlan {
  const [mode, ...targets] = args;
  if (!isPrettierMode(mode)) {
    throw new Error(
      "[prettier] usage: bun scripts/prettier.ts --check|--write [target ...]",
    );
  }

  const effectiveTargets = targets.length > 0 ? targets : ["."];
  return {
    name: "prettier",
    command: ["bunx", "prettier", mode, ...effectiveTargets],
  };
}

async function runCommand(
  name: string,
  command: readonly string[],
): Promise<CommandResult> {
  const proc = Bun.spawn([...command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { name, exitCode, stdout, stderr };
}

function flushResult(result: CommandResult): void {
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
}

export async function runPrettierPlan(
  plan: PrettierPlan,
  runner: CommandRunner = runCommand,
): Promise<CommandResult> {
  return runner(plan.name, plan.command);
}

if (import.meta.main) {
  try {
    const result = await runPrettierPlan(
      createPrettierPlan(process.argv.slice(2)),
    );
    flushResult(result);
    process.exit(result.exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
