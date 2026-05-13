/**
 * Per-file isolation test runner.
 *
 * 各 *.test.ts を独立した `bun test` サブプロセスで起動することで
 * mock.module() の live binding が test file 間に漏れる現象（Bun の仕様）を
 * 物理的に排除する。公式 docs 推奨の `afterEach(() => mock.restore())` でも
 * `mock.module()` のモジュールキャッシュ復元はカバーしきれず、横断 78+ ファイル
 * を抱えるこのリポジトリでは isolation が唯一の安定解。
 *
 * Usage:
 *   bun scripts/run-tests.mjs __tests__/unit
 *   bun scripts/run-tests.mjs __tests__/integration __tests__/integration/api
 *
 * 引数は 1 個以上のディレクトリ。各ディレクトリ配下を再帰探索し *.test.ts を
 * 名前順に並べて順次実行する。
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "[run-tests] usage: bun scripts/run-tests.mjs <dir> [<dir> ...]",
  );
  process.exit(2);
}

/** @param {string} dir @returns {string[]} */
function findTestFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`[run-tests] cannot read ${dir}: ${err.message}`);
    process.exit(2);
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const arg of args) {
  let st;
  try {
    st = statSync(arg);
  } catch (err) {
    console.error(`[run-tests] target not found: ${arg} (${err.message})`);
    process.exit(2);
  }
  if (st.isDirectory()) {
    files.push(...findTestFiles(arg));
  } else if (st.isFile() && arg.endsWith(".test.ts")) {
    files.push(arg);
  } else {
    console.error(`[run-tests] not a test dir or *.test.ts: ${arg}`);
    process.exit(2);
  }
}

files.sort();

if (files.length === 0) {
  console.error(`[run-tests] no *.test.ts found under: ${args.join(", ")}`);
  process.exit(2);
}

console.log(
  `[run-tests] ${files.length} test files (isolation: per-file bun subprocess)`,
);

/** @type {{file: string, status: number, ms: number}[]} */
const failures = [];
const t0All = Date.now();

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const t0 = Date.now();
  const r = spawnSync("bun", ["test", file], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const ms = Date.now() - t0;
  const ord = `(${i + 1}/${files.length})`;
  if (r.status === 0) {
    console.log(`[run-tests] ${ord} PASS ${file} (${ms}ms)`);
  } else {
    const status = r.status ?? -1;
    failures.push({ file, status, ms });
    console.error(`[run-tests] ${ord} FAIL ${file} (${ms}ms, exit=${status})`);
  }
}

const totalMs = Date.now() - t0All;
const passed = files.length - failures.length;
console.log(
  `\n[run-tests] done: ${passed} passed, ${failures.length} failed in ${(totalMs / 1000).toFixed(1)}s`,
);

if (failures.length > 0) {
  console.error("\n[run-tests] failed files:");
  for (const f of failures) console.error(`  - ${f.file} (exit=${f.status})`);
  process.exit(1);
}
