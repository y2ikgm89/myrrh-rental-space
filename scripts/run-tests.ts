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
  const file = files[i];
  if (file === undefined) continue;
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
  const proc = Bun.spawnSync(
    ["bun", "test", "--conditions", "production", file],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  );
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
