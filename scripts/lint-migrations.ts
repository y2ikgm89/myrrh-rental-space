/**
 * マイグレーション安全ゲート — 変更された Prisma migration SQL を Squawk で lint し、
 * Cloud Run rollout 中の旧 revision 参照事故を CI で検出する。
 *
 * 目的: Cloud Run のローリング切替窓（migrate 完了〜新リビジョン ready）で
 * 旧コードが破壊済み新スキーマを叩く 500 を merge 前に検出する。
 * 意図的な破壊的 migration は SQL に rule 名つき `-- squawk-ignore <rule>`
 * または `-- squawk-ignore-file <rule>` を置き、旧参照ゼロを確認したうえで明示する。
 *
 * 使い方:
 *   bun scripts/lint-migrations.ts <file.sql> [<file2.sql> ...]  # 指定ファイルを lint
 *   bun scripts/lint-migrations.ts --selftest                    # fixture でゲート自体を検証
 *
 * squawk バイナリは環境変数 SQUAWK_BIN（既定 "squawk"）。CI は公式リリースの
 * 生バイナリを SHA256 検証して直接渡す。npm ラッパー（squawk-cli）は spawn 失敗時に
 * exit 0 を返し偽陰性を生むため使わない。
 *
 * ## 免除の入口は `-- squawk-ignore` だけ
 *
 * かつてここには `INTENTIONAL_BREAKING_MIGRATIONS` という allowlist があり、
 * ファイルパスを 1 行足すだけで squawk を丸ごと skip できた。**削除した。**
 *
 * 理由は 2 つ:
 *
 * 1. **入口が 2 つあると弱いほうが使われる。** SQL に理由を書く（人目に触れる）より
 *    リストに 1 行足す（見えない）ほうが安いので、後者に流れる。
 * 2. 元々の存在理由（既 merge の migration の `-- squawk-ignore` を後から直せない
 *    deadlock）は、**これから書く migration には最初から当てはまらない**。
 *
 * 免除するときは SQL の先頭に `-- squawk-ignore-file <rule>` を書く。その migration が
 * 本当に計画ダウンタイム付きでデプロイされることは
 * `__tests__/unit/architecture/migration-squawk-ignore-is-breaking.test.ts` が
 * deploy-production.yml の正規表現と突き合わせて機械強制する
 * （**「安全である」と散文で主張するだけでは通らない**）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SQUAWK_BIN = process.env["SQUAWK_BIN"] ?? "squawk";
const CONFIG_PATH = join(import.meta.dir, "..", ".squawk.toml");
const FIXTURE_DIR = join(import.meta.dir, "lint-migrations.fixtures");

/** prisma migrate dev が生成する migration SQL のパス形だけを受け付ける（防御）。 */
const MIGRATION_PATH =
  /(^|[\\/])prisma[\\/]migrations[\\/].+[\\/]migration\.sql$/;

/**
 * baseline は squawk の検査対象外。**「古いから」ではなく前提が成立しないから**。
 *
 * squawk がこの repo で見ているのは「Cloud Run のローリング切替窓（migrate 完了〜
 * 新リビジョン ready）で**旧コードが破壊済み新スキーマを叩く**」事故（docblock 冒頭）。
 * baseline はまっさらな空の DB に対して走る最初の 1 本なので、
 *
 * - 旧 revision が存在しない → 参照事故の窓が無い
 * - 既存行が存在しない → `SET NOT NULL` / `ADD CONSTRAINT` がデータ違反で落ちない
 *
 * つまり squawk の全ルールが構造的に非該当になる。実際 `invariants.sql` の
 * `ALTER COLUMN … SET NOT NULL` 3 本が `adding-not-nullable-field` を発火させるが、
 * 空の DB では違反しようがない。
 *
 * **この免除を他の migration へ広げない。** 2 本目以降は必ず既存 DB に当たる。
 */
const BASELINE_MIGRATION =
  "prisma/migrations/00000000000000_init/migration.sql";

function isBaseline(file: string): boolean {
  return file.replaceAll("\\", "/") === BASELINE_MIGRATION;
}

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
      desc: "additive migration は通る（除外 rule の誤発火なし）",
    },
    {
      file: "ignored.sql",
      expectViolation: false,
      desc: "squawk-ignore で意図的な破壊的 migration は通る",
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

/**
 * 引数を「lint する / 実体が無い / migration SQL ですらない」に仕分ける。
 *
 * 実体の無いパスは lint しようが無い（削除された migration）。CI 側は
 * paths-filter を `added|modified` に絞ってそもそも渡さないが、履歴を畳む PR や
 * 手動実行で紛れ込みうるのでここでも落とす。
 *
 * **黙って捨てない。** 全件が実体無しのときに 0 件 lint で「通過」してしまうと、
 * typo したパスが緑になる。呼び出し側がそれを非ゼロにできるよう区別して返す。
 */
export function partitionMigrationArgs(
  args: readonly string[],
  exists: (path: string) => boolean = existsSync,
): {
  readonly present: readonly string[];
  readonly missing: readonly string[];
  readonly notMigrations: readonly string[];
} {
  const requested = args.filter((a) => MIGRATION_PATH.test(a));
  return {
    present: requested.filter((f) => exists(f)),
    missing: requested.filter((f) => !exists(f)),
    notMigrations: args.filter((a) => !MIGRATION_PATH.test(a)),
  };
}

function run(args: readonly string[]): number {
  if (args.includes("--selftest")) return selfTest();

  const { present, missing, notMigrations } = partitionMigrationArgs(args);

  if (notMigrations.length > 0) {
    console.error(
      `[migration-safety] migration SQL でない引数を無視: ${notMigrations.join(", ")}`,
    );
  }
  if (missing.length > 0) {
    console.error(
      `[migration-safety] 実体が無いので skip（削除済み migration）: ${missing.join(", ")}`,
    );
  }
  if (missing.length > 0 && present.length === 0) {
    console.error(
      "[migration-safety] 指定された migration が 1 件も実在しない — 引数を確認すること",
    );
    return 1;
  }

  const baseline = present.filter(isBaseline);
  const toLint = present.filter((f) => !isBaseline(f));
  for (const f of baseline) {
    console.error(
      `[migration-safety] baseline は空の DB に走るため squawk 非該当: ${f} — skip`,
    );
  }

  if (toLint.length === 0) {
    if (present.length === 0) {
      console.error("[migration-safety] 対象 migration SQL なし — skip");
    } else {
      console.error("[migration-safety] 全対象 migration が baseline — skip");
    }
    return 0;
  }

  console.error(`[migration-safety] lint 対象 ${toLint.length} 件:`);
  for (const f of toLint) console.error(`  - ${f}`);
  return runSquawk(toLint);
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
