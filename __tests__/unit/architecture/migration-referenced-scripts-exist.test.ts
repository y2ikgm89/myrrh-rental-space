/**
 * **migration が「これを流せ」と書いているスクリプトは、実在しなければならない。**
 *
 * ## なぜ
 *
 * migration は絶対規約 #7 で編集できない。ヘッダに書いた運用手順は**永久に残る**。
 * その手順が指すスクリプトを消すと、デプロイする人は実行不能な指示を読むことになり、
 * 手順を飛ばして適用する。飛ばした先が破壊的 DDL なら、そこで消えるのは
 * 「移し損ねたデータ」そのものになる。
 *
 * 実例: `locations.special_holidays` を DROP する migration はヘッダに
 * 「適用前: bun scripts/backfill-special-holidays-to-blocked-dates.ts --apply」と
 * 書いてあるのに、**同じコミットがそのスクリプトを削除した**。指示どおりに
 * 実行しようとした人は、まずスクリプトが無いことに気づく。気づかなければ、
 * 管理者が入れた特別休業日が黙って消える。
 *
 * 「一度きりのスクリプトだから消す」は正しいが、**消してよいのは
 * 「もう誰も実行できない／実行する必要が無い」と確認できてから**。
 * （この実例は決着した。migration は baseline へ畳まれてヘッダごと消え、
 * 移送元の列も残っていないので、スクリプトは
 * `one-time-backfill-clean-break.test.ts` の削除済みリストへ移した。
 * この gate が守るのは**これから書かれる** migration のヘッダ。）
 *
 * ## 何を見るか
 *
 * `prisma/migrations/**` の SQL に現れる `scripts/<name>.<ts|sh>` を全部拾い、
 * ファイルが存在することを確認する。ヘッダに限らず本文中の言及も見る
 * （どこに書いてあっても「読んだ人が探しに行く」ことに変わりはない）。
 *
 * baseline へ畳めば参照ごと消えるので、この gate は自動的に対象を失う。
 * allowlist は置かない — 「存在しないものを指してよい理由」は無い。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

/** `scripts/<name>.ts` / `scripts/<name>.sh` の参照。 */
const SCRIPT_REFERENCE = /\bscripts\/[A-Za-z0-9_.-]+\.(?:ts|sh)\b/gu;

function migrationSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      try {
        return statSync(join(MIGRATIONS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((dir) => `prisma/migrations/${dir}/migration.sql`)
    .filter((path) => existsSync(join(ROOT, path)));
}

/** そのテキストが指しているスクリプトのパス（repo 相対・重複排除）。 */
export function referencedScriptPaths(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(SCRIPT_REFERENCE)) {
    found.add(match[0]);
  }
  return [...found];
}

describe("migration が指すスクリプトは実在する", () => {
  test("走査対象の migration が実在する（gate 自体が空振りしていない）", () => {
    expect(migrationSqlFiles().length).toBeGreaterThan(0);
  });

  test("参照の抽出が効いている（fixture）", () => {
    expect(
      referencedScriptPaths(
        "-- 適用前: bun scripts/backfill-something.ts --apply",
      ),
    ).toEqual(["scripts/backfill-something.ts"]);
    expect(
      referencedScriptPaths("-- リハーサル: bun scripts/foo.ts && bun x"),
    ).toEqual(["scripts/foo.ts"]);
    expect(referencedScriptPaths("-- bash scripts/check.sh を流す")).toEqual([
      "scripts/check.sh",
    ]);
    // 同じ参照が 2 回出ても 1 件。
    expect(
      referencedScriptPaths("scripts/a.ts のあと scripts/a.ts をもう一度"),
    ).toEqual(["scripts/a.ts"]);
    // スクリプトでないパスは拾わない。
    expect(referencedScriptPaths("src/shared/db/prisma.ts を見る")).toEqual([]);
    expect(referencedScriptPaths("scripts/ ディレクトリ配下")).toEqual([]);
  });

  test("実在しないスクリプトを指している migration が無い", () => {
    const offenders: string[] = [];

    for (const path of migrationSqlFiles()) {
      const sql = readFileSync(join(ROOT, path), "utf8");
      const missing = referencedScriptPaths(sql).filter(
        (script) => !existsSync(join(ROOT, script)),
      );
      if (missing.length === 0) continue;
      offenders.push(`${path} :: ${missing.join(", ")}`);
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? "migration は編集できないので、ヘッダの手順は永久に残る。指しているスクリプトを消してよいのは本番で流し終えた後だけ。まだなら復元する"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
