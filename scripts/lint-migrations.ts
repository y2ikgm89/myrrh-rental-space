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
 * ## 意図的 breaking migration allowlist
 *
 * SQL 内 `-- squawk-ignore <rule>` は本来の SSoT だが、既 merge 済 migration の
 * `-- squawk-ignore` コメントの誤りを後から fix しようとすると
 * `scripts/check-protected-files.sh` (絶対規約 #7) が既 commit migration.sql の
 * M (modify) を pre-commit block してしまう。この deadlock を解消するため、
 * 意図的 breaking migration は下記 `INTENTIONAL_BREAKING_MIGRATIONS` に明示 entry
 * して squawk gate を skip する。allowlist は git-tracked で audit trail が残る。
 *
 * 追加基準 (all を満たす場合のみ):
 * 1. Cloud Run min0/max1 の single-instance atomic switch が Risk 1 (旧 revision が
 *    新スキーマを叩く 500) の窓を原理的に排除している (`.squawk.toml` 冒頭の
 *    「単一インスタンスでは過剰」justification 参照)。
 * 2. schema.prisma 側の変更で CLAUDE.md 絶対規約 #11「DROP/RENAME を含む migration
 *    は自動で計画ダウンタイム付きデプロイに切り替わる」判定が別 gate で走る。
 * 3. アプリ側 (`src/`) の型が新スキーマに合わせて更新済 (Prisma client 再生成 +
 *    型エラーゼロ)。
 *
 * 追加しない基準: 単に「squawk が warning 出したから」だけで entry を増やさない。
 * 追加時は必ず PR description で理由と Risk 1 が発生しない根拠を書く。
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const SQUAWK_BIN = process.env["SQUAWK_BIN"] ?? "squawk";
const CONFIG_PATH = join(import.meta.dir, "..", ".squawk.toml");
const FIXTURE_DIR = join(import.meta.dir, "lint-migrations.fixtures");

/** prisma migrate dev が生成する migration SQL のパス形だけを受け付ける（防御）。 */
const MIGRATION_PATH =
  /(^|[\\/])prisma[\\/]migrations[\\/].+[\\/]migration\.sql$/;

/**
 * 意図的 breaking migration の allowlist (git-tracked SSoT)。
 * repo root からの `/` 区切り path で列挙する。docblock の追加基準を満たす場合のみ
 * entry を増やすこと。
 */
const INTENTIONAL_BREAKING_MIGRATIONS: ReadonlySet<string> = new Set([
  // inquiry-overhaul Phase 1 (feat/inquiry-overhaul-schema, PR #1282):
  // `replyMessage` / `repliedAt` / `repliedById` を InquiryReply thread に移設、
  // `receiptNumber` に NOT NULL + UNIQUE を追加。SQL 内 `-- squawk-ignore` が
  // `prefer-robust-stmts` を指しており実 rule (adding-not-nullable-field /
  // ban-drop-column) と噛み合わないが、既 commit migration.sql の M は
  // check-protected-files.sh (絶対規約 #7) で block されるため allowlist で bypass。
  // Risk 1 の窓は Cloud Run min0/max1 の atomic switch で排除済。
  "prisma/migrations/20260719020000_inquiry_overhaul_phase1/migration.sql",
  // switchbot-official-clean (feat/switchbot-official-clean, PR #1457):
  // SmartLockDeviceType を clean break で再構築（LOCK_VISION_PRO 削除、
  // LOCK / LOCK_LITE / LOCK_PRO 追加）。`ALTER COLUMN ... TYPE` は
  // `changing-column-type` を発火し、`-- squawk-ignore changing-column-type` を
  // 直前行に置いても squawk が当該 rule を抑止しないため allowlist で bypass。
  // schema 側 DROP/RENAME 判定で計画ダウンタイム付きデプロイに切替。アプリ型は
  // 新 enum に更新済。Risk 1 の窓は Cloud Run min0/max1 の atomic switch で排除済。
  "prisma/migrations/20260724140200_smart_lock_device_type_clean_break/migration.sql",
]);

function isIntentionallyBreaking(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  return INTENTIONAL_BREAKING_MIGRATIONS.has(normalized);
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

const intentional = files.filter(isIntentionallyBreaking);
const toLint = files.filter((f) => !isIntentionallyBreaking(f));
for (const f of intentional) {
  console.error(
    `[migration-safety] intentional-breaking allowlist にマッチ: ${f} — squawk skip`,
  );
}

if (toLint.length === 0) {
  if (files.length === 0) {
    console.error("[migration-safety] 対象 migration SQL なし — skip");
  } else {
    console.error(
      "[migration-safety] 全対象 migration が intentional-breaking allowlist — squawk skip",
    );
  }
  process.exit(0);
}

console.error(`[migration-safety] lint 対象 ${toLint.length} 件:`);
for (const f of toLint) console.error(`  - ${f}`);
process.exit(runSquawk(toLint));
