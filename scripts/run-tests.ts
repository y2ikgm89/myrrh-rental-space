#!/usr/bin/env bun
/**
 * Per-file isolation test runner (Bun native).
 *
 * bun:test の `mock.module()` は process-global live binding を残す公式仕様。
 * 各 *.test.ts を独立した `bun test` サブプロセスで起動することで cross-file
 * 干渉を物理的に排除する。
 *
 * 公式準拠（bun.com/docs）:
 * - `Bun.spawnSync([...], options)` の primary form（配列引数）採用
 * - `new Bun.Glob(pattern).scanSync({ cwd })` で sync 走査（per-file runner は sync で十分）
 * - `Bun.Glob.scanSync` は OS-native path separator を返すため明示的に POSIX 正規化
 * - `process.env` / `process.argv` は Bun でも標準（`Bun.env` / `Bun.argv` は alias）
 *
 * Usage:
 *   bun scripts/run-tests.ts __tests__/unit
 *   bun scripts/run-tests.ts __tests__/integration __tests__/integration/api
 *   bun scripts/run-tests.ts __tests__/unit/lib/crypto.test.ts
 */

interface Failure {
  file: string;
  exitCode: number;
  ms: number;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "[run-tests] usage: bun scripts/run-tests.ts <dir> [<dir> ...]",
  );
  process.exit(2);
}

function normalize(target: string): string {
  return target.replaceAll("\\", "/").replace(/\/+$/u, "");
}

async function collectTestFiles(target: string): Promise<string[]> {
  const normalized = normalize(target);
  if (normalized.endsWith(".test.ts")) {
    if (!(await Bun.file(normalized).exists())) {
      console.error(`[run-tests] not found: ${normalized}`);
      process.exit(2);
    }
    return [normalized];
  }

  // Bun.Glob.scanSync は OS-native path separator を返す（Windows = "\"）
  // → POSIX "/" に正規化して `bun test <path>` 引数化
  const glob = new Bun.Glob("**/*.test.ts");
  const results: string[] = [];
  for (const rel of glob.scanSync({ cwd: normalized })) {
    results.push(`${normalized}/${rel.replaceAll("\\", "/")}`);
  }
  if (results.length === 0) {
    console.error(`[run-tests] no *.test.ts found under: ${normalized}`);
    process.exit(2);
  }
  return results;
}

const files: string[] = [];
for (const arg of args) {
  files.push(...(await collectTestFiles(arg)));
}
files.sort();

console.info(
  `[run-tests] ${files.length} test files (isolation: per-file bun subprocess)`,
);

const failures: Failure[] = [];
const t0All = performance.now();

for (let i = 0; i < files.length; i++) {
  const file = files[i]!;
  const t0 = performance.now();
  const proc = Bun.spawnSync(["bun", "test", file], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const ms = Math.round(performance.now() - t0);
  const ord = `(${i + 1}/${files.length})`;
  if (proc.success) {
    console.info(`[run-tests] ${ord} PASS ${file} (${ms}ms)`);
  } else {
    failures.push({ file, exitCode: proc.exitCode, ms });
    console.error(
      `[run-tests] ${ord} FAIL ${file} (${ms}ms, exit=${proc.exitCode})`,
    );
  }
}

const totalMs = Math.round(performance.now() - t0All);
const passed = files.length - failures.length;
console.info(
  `\n[run-tests] done: ${passed} passed, ${failures.length} failed in ${(totalMs / 1000).toFixed(1)}s`,
);

if (failures.length > 0) {
  console.error("\n[run-tests] failed files:");
  for (const f of failures) {
    console.error(`  - ${f.file} (exit=${f.exitCode})`);
  }
  process.exit(1);
}
