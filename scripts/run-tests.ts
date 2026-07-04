#!/usr/bin/env bun
/**
 * Per-file isolation test runner (Bun native, async parallel).
 *
 * bun:test の `mock.module()` は process-global live binding を残す公式仕様。
 * 各 *.test.ts を独立した `bun test` サブプロセスで起動することで cross-file
 * 干渉を物理的に排除する。隔離境界は **process** なので、process を並列に
 * 起動する分には汚染しない（公式仕様 SSoT）。
 *
 * ## 並列実行戦略
 *
 * - 既定並列度は CI では `min(navigator.hardwareConcurrency, 4)`、ローカルでは
 *   `min(navigator.hardwareConcurrency, 8)` の `p-limit` プール。CI の 4 上限は
 *   GitHub Actions の 2-4 vCPU と OOM 余裕を優先し、ローカルは実測に基づいて
 *   待ち時間を短縮する。`TEST_PARALLEL` 環境変数で上書き可能。
 * - **実 DB 接続テストは serial bucket に隔離**。`TEST_DATABASE_URL` を読み
 *   共有 Postgres を操作する 5 ファイル (cancel-by-token-roundtrip /
 *   reminder-idempotency / coupon-status-filter / registration-overbooking /
 *   scope-check-constraint) は順次実行で並列書込み競合を避ける。
 * - serial bucket と parallel bucket は **並列** に動かす (互いに DB 共有なし)。
 *
 * ## 出力順序保持
 *
 * 並列実行で stdout/stderr が interleave しないよう、各サブプロセスは
 * `stdout: "pipe"` / `stderr: "pipe"` で buffer し、完了時に file 単位で
 * 一括 flush する (Promise.all で並列収集 → 順次 write)。
 *
 * 公式準拠（bun.com/docs）:
 * - `Bun.spawn([...], { stdout: "pipe", stderr: "pipe" })` async API
 *   <https://bun.com/docs/runtime/child-process>
 * - `proc.stdout.text()` / `proc.stderr.text()` / `proc.exited` を
 *   `Promise.all` で同時 await する公式パターン
 * - `new Bun.Glob(pattern).scanSync({ cwd })` で sync 走査
 * - `Bun.Glob.scanSync` は OS-native path separator を返すため POSIX 正規化
 *
 * Usage:
 *   bun scripts/run-tests.ts __tests__/unit
 *   bun scripts/run-tests.ts __tests__/integration __tests__/integration/api
 *   bun scripts/run-tests.ts __tests__/unit/lib/crypto.test.ts
 *
 * Env:
 *   TEST_PARALLEL  並列度の手動上書き (default: CI min(cpu, 4), local min(cpu, 8))
 */

import pLimit from "p-limit";
import { resolveTestConcurrency } from "./test-runner-concurrency";
import {
  assertRequiredTestDatabaseUrl,
  findSelectedSerialDbTests,
  SERIAL_DB_TESTS,
} from "./test-db-runner-env";

interface FileResult {
  file: string;
  exitCode: number;
  ms: number;
  stdout: string;
  stderr: string;
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
  if (normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx")) {
    if (!(await Bun.file(normalized).exists())) {
      console.error(`[run-tests] not found: ${normalized}`);
      process.exit(2);
    }
    return [normalized];
  }

  // Bun.Glob.scanSync は OS-native path separator を返す（Windows = "\"）
  // → POSIX "/" に正規化して `bun test <path>` 引数化
  const glob = new Bun.Glob("**/*.test.{ts,tsx}");
  const results: string[] = [];
  for (const rel of glob.scanSync({ cwd: normalized })) {
    results.push(`${normalized}/${rel.replaceAll("\\", "/")}`);
  }
  if (results.length === 0) {
    console.error(`[run-tests] no *.test.{ts,tsx} found under: ${normalized}`);
    process.exit(2);
  }
  return results;
}

const files: string[] = [];
for (const arg of args) {
  files.push(...(await collectTestFiles(arg)));
}
files.sort();

const selectedSerialDbTests = findSelectedSerialDbTests(files);
const testDatabaseUrlCheck = assertRequiredTestDatabaseUrl({
  selectedSerialDbTests,
  testDatabaseUrl: process.env["TEST_DATABASE_URL"],
});
if (!testDatabaseUrlCheck.ok) {
  console.error(testDatabaseUrlCheck.message);
  process.exit(1);
}

const parallelFiles = files.filter((f) => !SERIAL_DB_TESTS.has(f));
const serialFiles = selectedSerialDbTests;

const concurrency = resolveTestConcurrency({
  cpuCount: navigator.hardwareConcurrency || 1,
  envParallel: process.env["TEST_PARALLEL"],
  isCi: process.env["CI"] === "true",
});

console.info(
  `[run-tests] ${files.length} test files ` +
    `(parallel=${parallelFiles.length} @ concurrency=${concurrency}, ` +
    `serial=${serialFiles.length}, isolation: per-file bun subprocess)`,
);

async function runOne(file: string): Promise<FileResult> {
  const t0 = performance.now();
  // `--conditions production`: package.json `exports` の `production` 条件を強制し
  // `@lexical/*` を bundled `.prod.mjs` で解決する。Bun 公式 [Conditional Exports]
  // (https://bun.com/docs/runtime/modules#conditional-exports) に基づく公式機構。
  //
  // ## なぜこれが「根本解決」か
  //
  // Lexical 0.45.x の `.dev.mjs` 群は **全 14 @lexical パッケージにまたがる**
  // 循環 ESM import を抱えており、Bun の strict ESM resolver 配下で TDZ
  // (Temporal Dead Zone) violation を起こす。具体的には:
  //
  // - `@lexical/list` → `defineImportRule` / `ElementNode` 未初期化参照
  // - `@lexical/link` → `defineImportRule` 同様
  // - `@lexical/react` → `HorizontalRuleNode$1` 同様
  // - 他パッケージにも transitively 拡散
  //
  // 実証: nightly (0.45.1-nightly.20260619) も同症状 (パッケージが別所に転移する
  // のみ・上流未修正)。Webpack / Vite 等のバンドラは tree-shake + hoist で循環を
  // 解消するため検知されず、`.prod.mjs` (bundled single-file) もこの恩恵で動く。
  //
  // 個別パッケージ patch / 上流 PR は 14 件規模の修正が必要で現実的でない。
  // `--conditions production` は `exports` の `production` を **全 @lexical 系統に
  // 一括適用**し、bundled かつ循環解消済みの `.prod.mjs` を選択する。Bun の
  // 公式機構を使った唯一の系統的解。
  //
  // ## トレードオフ
  //
  // - 副作用: テストが minified bundled コードを実行するため、Lexical 内部の
  //   stack trace は読みづらい。ただし当 repo は Lexical を黒箱として使う統合
  //   テストのみで、内部実装の dev assertion / 詳細 stack に依存しない。
  // - 本番ランタイムは Next.js build 経由で同 `production` 条件が解決されるため、
  //   テストと本番のバイナリは整合 (`.prod.mjs` を共通参照)。
  const proc = Bun.spawn(["bun", "test", "--conditions", "production", file], {
    stdout: "pipe",
    stderr: "pipe",
  });
  // 公式パターン: stdout / stderr / exited を Promise.all で同時 await。
  // pipe バッファが full にならないよう必ず並列で吸い出す。
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const ms = Math.round(performance.now() - t0);
  return { file, exitCode, ms, stdout, stderr };
}

let doneCount = 0;
function flushResult(result: FileResult): void {
  doneCount += 1;
  const ord = `(${doneCount}/${files.length})`;
  // file 単位で buffer 済みなので write 中に interleave しない。
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  if (result.exitCode === 0) {
    console.info(`[run-tests] ${ord} PASS ${result.file} (${result.ms}ms)`);
  } else {
    console.error(
      `[run-tests] ${ord} FAIL ${result.file} (${result.ms}ms, exit=${result.exitCode})`,
    );
  }
}

const t0All = performance.now();
const results: FileResult[] = [];

// 並列バケット: p-limit で同時実行数を絞る。各タスクは完了次第 flush。
const limit = pLimit(concurrency);
const parallelPromises = parallelFiles.map((file) =>
  limit(async () => {
    const r = await runOne(file);
    results.push(r);
    flushResult(r);
    return r;
  }),
);

// Serial バケット: 共有 Postgres を順次操作 (並列バケットとは並行に進む)。
const serialPromise = (async () => {
  for (const file of serialFiles) {
    const r = await runOne(file);
    results.push(r);
    flushResult(r);
  }
})();

await Promise.all([...parallelPromises, serialPromise]);

const totalMs = Math.round(performance.now() - t0All);
const failures = results.filter((r) => r.exitCode !== 0);
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
