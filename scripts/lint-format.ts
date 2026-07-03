#!/usr/bin/env bun

type LintFormatCommand = {
  name: string;
  command: readonly string[];
};

export type CommandResult = {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

type LintFormatPlan = {
  parallel: readonly LintFormatCommand[];
};

type CommandRunner = (
  name: string,
  command: readonly string[],
) => Promise<CommandResult>;

export function createLintFormatPlan(): LintFormatPlan {
  return {
    parallel: [
      { name: "format:check", command: ["bun", "run", "format:check"] },
      { name: "lint", command: ["bun", "run", "lint"] },
    ],
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

export async function runLintFormatPlan(
  plan: LintFormatPlan,
  runner: CommandRunner = runCommand,
): Promise<{ exitCode: number; results: CommandResult[] }> {
  const results = await Promise.all(
    plan.parallel.map((step) => runner(step.name, step.command)),
  );
  const failed = results.find((result) => result.exitCode !== 0);
  return { exitCode: failed?.exitCode ?? 0, results };
}

if (import.meta.main) {
  const startedAt = performance.now();
  const { exitCode, results } = await runLintFormatPlan(createLintFormatPlan());
  for (const result of results) flushResult(result);
  const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.info(`[lint-format] finished in ${elapsedSeconds}s`);
  process.exit(exitCode);
}
