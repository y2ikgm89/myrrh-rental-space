#!/usr/bin/env bun
/**
 * `next typegen` 後に `.next/types/cache-life.d.ts` 等が揃うまで再試行する。
 * クリーン環境や Windows 上で TS6053（include に合致するファイルが無い）が出るのを防ぐ。
 *
 * 公式準拠（bun.com/docs）:
 * - `Bun.spawnSync([...], options)` の primary form（配列引数）採用
 * - `Bun.file(path).exists()` で非同期存在チェック
 * - `Bun.file(path).text()` で読み取り検証
 */

const required = [
  ".next/types/routes.d.ts",
  ".next/types/cache-life.d.ts",
] as const;

function runTypegen(): void {
  const proc = Bun.spawnSync(["bunx", "--bun", "next", "typegen"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (!proc.success) {
    process.exit(proc.exitCode);
  }
}

async function missingFiles(): Promise<string[]> {
  const results: string[] = [];
  for (const path of required) {
    if (!(await Bun.file(path).exists())) {
      results.push(path);
    }
  }
  return results;
}

let missing = await missingFiles();
if (missing.length > 0) {
  runTypegen();
  missing = await missingFiles();
}
if (missing.length > 0) {
  console.warn(
    "[ensure-next-types] 再試行: Next の型ファイルが未生成のため typegen をもう一度実行します",
  );
  runTypegen();
  missing = await missingFiles();
}
if (missing.length > 0) {
  console.error(
    "[ensure-next-types] 次が見つかりません:",
    missing.join(", "),
    "\n`rm -rf .next` のあと `bunx --bun next typegen` を実行してください。",
  );
  process.exit(1);
}

for (const path of required) {
  try {
    await Bun.file(path).text();
  } catch {
    console.error("[ensure-next-types] 読み取り失敗:", path);
    process.exit(1);
  }
}

// `.next/dev/types/` は `next dev`（Turbopack）のみが生成する dev 専用の型成果物で、
// `next typegen`（`.next/types/` を生成）では再生成されない。dev server と
// standalone な type-check（CI / lefthook / Stop hook）を並行実行すると
// `.next/dev/types/routes.d.ts` 等が書き込み競合で破損し、以降 dev server を
// 停止しても破損ファイルが残って tsc が読み続けて失敗する（CI には存在しない
// ため CI は緑なのにローカルだけ赤になる silent block）。tsconfig の
// `.next/dev/types/**/*.ts` include は Next.js 16 が自動管理する公式構成のため
// 除去できない。代わりにここで dev 専用成果物を消し、tsc を CI と同じく
// `.next/types/` のみで決定論的に検証する（自己修復）。`.next/dev/types` 不在
// （CI / 初回）は no-op。
try {
  const devTypesGlob = new Bun.Glob("**/*.ts");
  for (const path of devTypesGlob.scanSync({
    cwd: ".next/dev/types",
    absolute: true,
  })) {
    await Bun.file(path).delete();
  }
} catch {
  // `.next/dev/types` が存在しない場合は何もしない
}
