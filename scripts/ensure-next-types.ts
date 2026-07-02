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
