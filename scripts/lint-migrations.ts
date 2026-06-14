/**
 * マイグレーション安全ゲート — 変更された Prisma migration SQL を Squawk で lint し、
 * expand / contract 規約（.claude/rules/migrations.md / Risk 1）を CI で強制する。
 *
 * 目的: Cloud Run のローリング切替窓（migrate 完了〜新リビジョン ready）で
 * 旧コードが破壊済み新スキーマを叩く 500 を、後方互換でない変更を merge 前に
 * ブロックすることで構造的に防ぐ。
 *
 * 使い方:
 *   bun scripts/lint-migrations.ts <file.sql> [<file2.sql> ...]  # 指定ファイルを lint
 *   bun scripts/lint-migrations.ts --selftest                    # fixture でゲート自体を検証
 *
 * squawk バイナリは環境変数 SQUAWK_BIN（既定 "squawk"）。CI は公式リリースの
 * 生バイナリを SHA256 検証して直接渡す。npm ラッパー（squawk-cli）は spawn 失敗時に
 * exit 0 を返し偽陰性を生むため使わない。
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const SQUAWK_BIN = process.env["SQUAWK_BIN"] ?? "squawk";
const CONFIG_PATH = join(import.meta.dir, "..", ".squawk.toml");
const FIXTURE_DIR = join(import.meta.dir, "lint-migrations.fixtures");

/** prisma migrate dev が生成する migration SQL のパス形だけを受け付ける（防御）。 */
const MIGRATION_PATH =
  /(^|[\\/])prisma[\\/]migrations[\\/].+[\\/]migration\.sql$/;

/** squawk を実行し exit code を返す。違反検出時は非ゼロ（squawk 本体仕様）。 */
function runSquawk(files: readonly string[]): number {
  const result = spawnSync(SQUAWK_BIN, ["--config", CONFIG_PATH, ...files], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(
      `[migration-safety] squawk 実行に失敗: ${result.error.message}`,
    );
    return 1;
  }
  // signal kill は status=null。安全側に倒して失敗扱いにする。
  return result.status ?? 1;
}

/** fixture でゲート挙動を実環境で検証する（unsafe→検出 / safe→通過 / ignored→通過）。 */
function selfTest(): number {
  const cases = [
    {
      file: "unsafe.sql",
      expectViolation: true,
      desc: "DROP COLUMN を検出する",
    },
    {
      file: "safe.sql",
      expectViolation: false,
      desc: "後方互換な変更は通る（除外 rule の誤発火なし）",
    },
    {
      file: "ignored.sql",
      expectViolation: false,
      desc: "squawk-ignore で contract DROP は通る",
    },
  ] as const;

  let failed = false;
  for (const c of cases) {
    const code = runSquawk([join(FIXTURE_DIR, c.file)]);
    const gotViolation = code !== 0;
    const ok = gotViolation === c.expectViolation;
    console.error(
      `[selftest] ${ok ? "OK" : "NG"} ${c.file} (exit=${code}) — ${c.desc}`,
    );
    if (!ok) failed = true;
  }
  if (failed) {
    console.error(
      "[migration-safety] self-test 失敗: ゲート挙動が想定と不一致",
    );
    return 1;
  }
  console.error("[migration-safety] self-test 通過");
  return 0;
}

const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  process.exit(selfTest());
}

const files = args.filter((a) => MIGRATION_PATH.test(a));
const skipped = args.filter((a) => !MIGRATION_PATH.test(a));
if (skipped.length > 0) {
  console.error(
    `[migration-safety] migration SQL でない引数を無視: ${skipped.join(", ")}`,
  );
}
if (files.length === 0) {
  console.error("[migration-safety] 対象 migration SQL なし — skip");
  process.exit(0);
}

console.error(`[migration-safety] lint 対象 ${files.length} 件:`);
for (const f of files) console.error(`  - ${f}`);
process.exit(runSquawk(files));
