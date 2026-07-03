#!/usr/bin/env bun

type TypeCheckCommand = {
  name: string;
  command: readonly string[];
};

export type CommandResult = {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

type TypeCheckPlan = {
  setup: readonly TypeCheckCommand[];
  parallel: readonly TypeCheckCommand[];
};

type CommandRunner = (
  name: string,
  command: readonly string[],
) => Promise<CommandResult>;

export function createTypeCheckPlan(): TypeCheckPlan {
  return {
    setup: [
      { name: "toolchain:check", command: ["bun", "run", "toolchain:check"] },
      { name: "prisma:generate", command: ["bun", "run", "db:generate"] },
      { name: "next:typegen", command: ["bun", "--bun", "next", "typegen"] },
      {
        name: "next:ensure-types",
        command: ["bun", "scripts/ensure-next-types.ts"],
      },
      {
        name: "next:clean-dev-types",
        command: ["bun", "scripts/clean-next-dev-types.ts"],
      },
    ],
    parallel: [
      {
        name: "tsc:app",
        command: ["bunx", "--bun", "tsc", "--noEmit", "--incremental", "false"],
      },
      {
        name: "tsc:test",
        command: [
          "bunx",
          "--bun",
          "tsc",
          "--noEmit",
          "--incremental",
          "false",
          "-p",
          "tsconfig.test.json",
        ],
      },
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

export async function runTypeCheckPlan(
  plan: TypeCheckPlan,
  runner: CommandRunner = runCommand,
): Promise<{ exitCode: number; results: CommandResult[] }> {
  const results: CommandResult[] = [];

  for (const step of plan.setup) {
    const result = await runner(step.name, step.command);
    results.push(result);
    if (result.exitCode !== 0) {
      return { exitCode: result.exitCode, results };
    }
  }

  const parallelResults = await Promise.all(
    plan.parallel.map((step) => runner(step.name, step.command)),
  );
  results.push(...parallelResults);

  const failed = parallelResults.find((result) => result.exitCode !== 0);
  return { exitCode: failed?.exitCode ?? 0, results };
}

if (import.meta.main) {
  const startedAt = performance.now();
  const { exitCode, results } = await runTypeCheckPlan(createTypeCheckPlan());
  for (const result of results) flushResult(result);
  const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.info(`[type-check] finished in ${elapsedSeconds}s`);
  process.exit(exitCode);
}
