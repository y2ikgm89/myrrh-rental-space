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

/**
 * 子プロセスの出力を **行が出た瞬間に** 転送する。
 *
 * 以前は `new Response(proc.stdout).text()` で全部バッファし、両方が終わってから
 * まとめて流していた。並列に走る 2 つの出力が混ざらない利点はあるが、**プロセスが
 * 途中で殺されると出力が丸ごと失われる**。CI で `lint-format` が SIGTERM(143) で
 * 落ちたとき、ESLint 側のメッセージが 1 行も残らず原因が特定できなかった
 * （2026-08-12、Lint & Format が 2/2 で再現的に死亡）。
 *
 * 行頭に `[name]` を付けて即時転送すれば、混ざっても読めるうえに死んでも残る。
 */
async function pipeLines(
  stream: ReadableStream<Uint8Array> | null,
  name: string,
  sink: { write: (chunk: string) => unknown },
  collected: string[],
): Promise<void> {
  if (stream === null) return;

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    collected.push(text);
    buffer += text;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      sink.write(`[${name}] ${buffer.slice(0, newlineIndex)}\n`);
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  // 改行で終わらない末尾も落とさない
  if (buffer.length > 0) sink.write(`[${name}] ${buffer}\n`);
}

async function runCommand(
  name: string,
  command: readonly string[],
): Promise<CommandResult> {
  const proc = Bun.spawn([...command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const [, , exitCode] = await Promise.all([
    pipeLines(proc.stdout, name, process.stdout, stdoutChunks),
    pipeLines(proc.stderr, name, process.stderr, stderrChunks),
    proc.exited,
  ]);
  return {
    name,
    exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
  };
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
  // 出力は runCommand が逐次流している（ここでまとめて流すと二重になる）。
  const { exitCode } = await runLintFormatPlan(createLintFormatPlan());
  const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.info(`[lint-format] finished in ${elapsedSeconds}s`);
  process.exit(exitCode);
}
