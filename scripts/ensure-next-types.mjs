/**
 * `next typegen` 後に `.next/types/cache-life.d.ts` 等が揃うまで再試行する。
 * クリーン環境や Windows 上で TS6053（include に合致するファイルが無い）が出るのを防ぐ。
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const required = [
  join(root, ".next/types/routes.d.ts"),
  join(root, ".next/types/cache-life.d.ts"),
];

function runTypegen() {
  const r = spawnSync("bunx", ["--bun", "next", "typegen"], {
    stdio: "inherit",
    cwd: root,
    shell: true,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

let missing = required.filter((p) => !existsSync(p));
if (missing.length > 0) {
  runTypegen();
  missing = required.filter((p) => !existsSync(p));
}
if (missing.length > 0) {
  console.warn(
    "[ensure-next-types] 再試行: Next の型ファイルが未生成のため typegen をもう一度実行します",
  );
  runTypegen();
  missing = required.filter((p) => !existsSync(p));
}
if (missing.length > 0) {
  console.error(
    "[ensure-next-types] 次が見つかりません:",
    missing.join(", "),
    "\n`rm -rf .next` のあと `bunx --bun next typegen` を実行してください。",
  );
  process.exit(1);
}

for (const p of required) {
  try {
    readFileSync(p);
  } catch {
    console.error("[ensure-next-types] 読み取り失敗:", p);
    process.exit(1);
  }
}
