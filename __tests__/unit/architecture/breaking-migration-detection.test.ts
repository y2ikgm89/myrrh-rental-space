import { describe, expect, test } from "bun:test";

import {
  PIPE_BUFFER_BYTES,
  detectsBreaking,
  extractBreakingMigrationPattern,
  extractDetectionPipeline,
  posixEreToJsRegExp,
  readDeployWorkflow,
  runWorkflowDetection,
} from "../../support/breaking-migration-pattern";

// Regression gate for MIG-EXPAND-01
// (deploy-safety finding, PR fix/breaking-migration-detection-regex).
//
// .github/workflows/deploy-production.yml greps migration SQL for destructive
// patterns to enable "breaking migration deploy mode" (scale both services to 0
// + 310 s drain = planned downtime). If a destructive pattern is missed here,
// the migration ships live and users hit locks in production.
//
// The 5 destructive families this suite pins:
//   1. DROP     — DROP COLUMN / DROP TABLE / DROP TYPE / DROP CONSTRAINT
//   2. RENAME   — RENAME COLUMN / RENAME TO
//   3. TYPE     — ALTER COLUMN ... TYPE (full table rewrite + AccessExclusiveLock)
//   4. NOT NULL — ALTER COLUMN ... SET NOT NULL (full table scan under lock)

// workflow を読む知識（パターン抽出・パイプライン抽出・bash 実行）は
// `__tests__/support/breaking-migration-pattern.ts` に一本化してある。
// ここに複製を置くと、片方だけ直したときにもう片方が黙って古いままになる。
const workflow = readDeployWorkflow();
const breakingPattern = extractBreakingMigrationPattern(workflow);
const breakingRegex = posixEreToJsRegExp(breakingPattern);

const detectionPipeline = extractDetectionPipeline(workflow);

/** 破壊的パターンを 1 つも含まない padding を、指定バイト数以上まで積む。 */
function safePadding(minimumBytes: number): string {
  const statements: string[] = [];
  let bytes = 0;
  let index = 0;
  while (bytes < minimumBytes) {
    const statement = `CREATE INDEX "idx_padding_${String(index)}" ON "padding_table" ("column_${String(index)}");\n`;
    statements.push(statement);
    bytes += statement.length; // ASCII のみなので文字数 = バイト数
    index += 1;
  }
  return statements.join("");
}

const breakingFixtures: ReadonlyArray<{
  readonly name: string;
  readonly sql: string;
}> = [
  {
    name: "DROP COLUMN",
    sql: 'ALTER TABLE "users" DROP COLUMN "foo";',
  },
  {
    name: "RENAME COLUMN",
    sql: 'ALTER TABLE "users" RENAME COLUMN "foo" TO "bar";',
  },
  {
    name: "RENAME TO (table rename)",
    sql: 'ALTER TABLE "users" RENAME TO "customers";',
  },
  {
    name: "ALTER COLUMN ... TYPE (Postgres shorthand)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" TYPE integer;',
  },
  {
    name: "ALTER COLUMN ... SET DATA TYPE (Prisma output)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" SET DATA TYPE INTEGER;',
  },
  {
    name: "ALTER COLUMN ... SET NOT NULL",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" SET NOT NULL;',
  },
  {
    // 以前は safeFixtures 側に「DROP DEFAULT (metadata-only)」として置かれていた。
    // その判断は **ロック/rewrite コスト**の話で、この gate が守っている Risk 1
    // （旧 revision が新スキーマを叩いて 500）とは別の軸だった。
    //
    // `@default(dbgenerated(...))` から生成された旧 revision の Prisma Client は
    // その列を INSERT に含めない。cloudbuild は migrate を新 revision のデプロイより
    // **先**に走らせるので、DEFAULT が消えた瞬間から新 revision が出るまでの窓で
    // 旧 revision の INSERT が NOT NULL 違反になる。まさに Risk 1。
    //
    // grep では「旧コードがその DEFAULT に依存しているか」を判別できないので、
    // 依存していない DROP DEFAULT も巻き込んで停止モードに入る。単一インスタンス・
    // 低トラフィックで手動デプロイのこの構成では、過剰検知の代償（310 秒の計画停止）
    // より見逃しの代償（本番 500）の方がはるかに大きい。
    name: "ALTER COLUMN ... DROP DEFAULT",
    sql: 'ALTER TABLE "receipts" ALTER COLUMN "id" DROP DEFAULT;',
  },
  {
    name: "DROP CONSTRAINT",
    sql: 'ALTER TABLE "users" DROP CONSTRAINT "users_foo_key";',
  },
  {
    name: "DROP TABLE",
    sql: 'DROP TABLE "users";',
  },
  {
    name: "DROP TYPE",
    sql: 'DROP TYPE "TaxInputMode";',
  },
  {
    name: "case-insensitive lowercase drop column",
    sql: 'alter table "users" drop column "foo";',
  },
  // 以下は改行を挟む実在の書き方。単一行 fixture しか無かったため、この抜けが
  // 長期間見えていなかった（マージ済み migration が 1 件すり抜けている）。
  {
    name: "multi-line ALTER COLUMN ... SET DATA TYPE (Prisma の折返し出力)",
    sql: 'ALTER TABLE "terms_agreements"\n  ALTER COLUMN resource_id SET DATA TYPE TEXT USING resource_id::TEXT;',
  },
  {
    name: "multi-line DROP COLUMN",
    sql: 'ALTER TABLE "users"\n  DROP COLUMN "foo";',
  },
  {
    name: "multi-line ALTER COLUMN ... SET NOT NULL",
    sql: 'ALTER TABLE "users"\n  ALTER COLUMN "foo"\n  SET NOT NULL;',
  },
  {
    name: "先行コメントがあっても本文は検出する",
    sql: '-- 意図的な破壊的変更。理由は PR 参照。\nALTER TABLE "users"\n  DROP COLUMN "foo";',
  },
  // enum の rename。**この 2 つは長期間 grep から漏れていた**（Codex #1924 P1）。
  // 旧 revision は生成済み client が持つ旧型名・旧値をそのまま送るため、
  // 計画ダウンタイム無しで migrate が走ると `invalid input value for enum` になる。
  // 実際にこの状態で書かれた migration が履歴にある。
  {
    name: "ALTER TYPE ... RENAME VALUE（旧 revision が旧値を送って落ちる）",
    sql: `ALTER TYPE "DiscountType" RENAME VALUE 'none' TO 'NONE';`,
  },
  {
    name: "ALTER TYPE ... RENAME TO（旧 revision の生 SQL cast が落ちる）",
    sql: 'ALTER TYPE "DiscountType" RENAME TO discount_type;',
  },
  {
    name: "multi-line ALTER TYPE ... RENAME VALUE",
    sql: `ALTER TYPE "DiscountType"\n  RENAME VALUE 'none' TO 'NONE';`,
  },
];

const safeFixtures: ReadonlyArray<{
  readonly name: string;
  readonly sql: string;
}> = [
  {
    name: "CREATE TABLE (new table)",
    sql: 'CREATE TABLE "users" ("id" TEXT NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id"));',
  },
  {
    name: "ADD COLUMN (expand)",
    sql: 'ALTER TABLE "users" ADD COLUMN "foo" TEXT;',
  },
  {
    // `RENAME TO` を破壊的と見るのは `ALTER TABLE` と `ALTER TYPE` だけ。
    // index / sequence の名前は旧 revision のコードが参照しないので発動させない。
    // Prisma は index の `map` を変えると ALTER INDEX ... RENAME TO を出すので、
    // これは実際に起こる形。
    name: "ALTER INDEX ... RENAME TO (旧 revision は index 名を参照しない)",
    sql: 'ALTER INDEX "posts_slug_key" RENAME TO "posts_slug_active_key";',
  },
  {
    name: "ALTER SEQUENCE ... RENAME TO (旧 revision は sequence 名を参照しない)",
    sql: 'ALTER SEQUENCE "s" RENAME TO "s2";',
  },
  {
    // enum への**値の追加**は旧 revision を壊さない（旧コードはその値を送らない）。
    // 破壊的なのは RENAME だけ。ここを一緒くたに breaking 扱いすると、
    // 追加だけの migration にも計画ダウンタイムが付く。
    name: "ALTER TYPE ... ADD VALUE (expand、旧 revision は新値を送らない)",
    sql: "ALTER TYPE \"Role\" ADD VALUE 'AUDITOR';",
  },
  {
    // **`.*(RENAME)` と書くとここが誤爆する。** 値や型名に RENAME という語が
    // 含まれるだけで計画ダウンタイム（310 秒の全停止）に入ってしまう。
    // 節そのもの（`RENAME VALUE` / `RENAME TO`）に一致させる必要がある。
    name: "ALTER TYPE ... ADD VALUE で値に RENAME を含む",
    sql: "ALTER TYPE \"Role\" ADD VALUE 'RENAMED';",
  },
  {
    name: "ALTER TYPE ... ADD VALUE で型名に Rename を含む",
    sql: "ALTER TYPE \"RenameState\" ADD VALUE 'READY';",
  },
  {
    name: "DROP NOT NULL (nullable relaxation, safe)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" DROP NOT NULL;',
  },
  {
    name: "SET DEFAULT (metadata-only)",
    sql: 'ALTER TABLE "users" ALTER COLUMN "foo" SET DEFAULT \'bar\';',
  },
  {
    name: "CREATE INDEX CONCURRENTLY (expand, no rewrite)",
    sql: 'CREATE INDEX CONCURRENTLY "users_foo_idx" ON "users" ("foo");',
  },
  {
    name: "CREATE TYPE (new enum)",
    sql: "CREATE TYPE \"Role\" AS ENUM ('ADMIN', 'USER');",
  },
  {
    name: "COMMENT ON COLUMN",
    sql: 'COMMENT ON COLUMN "users"."foo" IS \'note\';',
  },
  // 正規化で誤検知を作っていないことの確認。改行を潰すだけで `;` 分割を
  // 怠ると、この 2 文が `.*` で橋渡しされて breaking と誤判定される。
  {
    name: "隣接する安全な 2 文が繋がって誤検知しない",
    sql: 'ALTER TABLE "users" ADD COLUMN "foo" TEXT;\nCREATE TYPE "Role" AS ENUM (\'ADMIN\');',
  },
  {
    name: "コメント中の散文は検出しない",
    sql: '-- Prisma の diff は DROP COLUMN "legacy" も提案してきたが意図的に外した。\nALTER TABLE "users" ADD COLUMN "foo" TEXT;',
  },
];

/**
 * workflow の正規表現から「発動条件の一覧」を**構造ごと**導出する。
 *
 * 手で保守する対応表は置かない。前版は語だけを平坦に抜き出していたため、
 * `RENAME TO` が `ALTER TABLE ...` の下にネストしている事実が落ち、
 * 「RENAME TO は停止する」と読める形になっていた。実際には
 * `ALTER INDEX ... RENAME TO`（Prisma が index の `map` 変更で出す）は
 * **発動しない**（実測で確認）。語の一致しか見ない検査では気づけない。
 *
 * 正規表現の入れ子（`ALTER TABLE .*( … | ALTER COLUMN .*( … ) )`）をそのまま
 * 前置詞として畳み込み、`ALTER TABLE ... ALTER COLUMN ... TYPE` のような
 * 完全修飾の表記を作る。運用者へ発動条件を書き出すときは、この導出結果を
 * そのまま使う（手書きの対応表を置くと必ず drift する）。
 *
 * **かつてはこの導出結果を、運用者向けドキュメント 4 本の `breaking-triggers`
 * ブロックと集合一致で突き合わせていた。** それらのドキュメントを repo から
 * 外したので、突き合わせ先は無くなっている。発動条件の SSoT は
 * `.github/workflows/deploy-production.yml` の正規表現ただ 1 つ。
 */
function splitTopLevelAlternatives(pattern: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of pattern) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "|" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** 前置部分（`ALTER TABLE .*`）を人間向けの `ALTER TABLE ...` に均す。 */
function toPrefixProse(raw: string): string {
  return raw.replaceAll(".*", "...").replace(/\s+/gu, " ").trim();
}

function deriveTriggerProse(pattern: string): string[] {
  const normalized = pattern.replaceAll("[[:space:]]+", " ");
  const items: string[] = [];

  for (const branch of splitTopLevelAlternatives(normalized)) {
    const groupStart = branch.indexOf("(");
    if (groupStart === -1) {
      items.push(branch.replace(/\s+/gu, " ").trim());
      continue;
    }
    const groupEnd = branch.lastIndexOf(")");
    const prefix = toPrefixProse(branch.slice(0, groupStart));
    const inner = branch.slice(groupStart + 1, groupEnd);
    for (const nested of deriveTriggerProse(inner)) {
      items.push(`${prefix} ${nested}`.replace(/\s+/gu, " ").trim());
    }
  }

  return items;
}

describe("breaking migration detection regex (MIG-EXPAND-01)", () => {
  test("pattern is present in deploy-production.yml", () => {
    expect(breakingPattern.length).toBeGreaterThan(0);
  });

  test("workflow pattern covers the 5 destructive families in one grep", () => {
    // These substrings encode each destructive family. Losing any one of them
    // would silently ship the corresponding change without downtime mode.
    expect(breakingPattern).toContain("DROP[[:space:]]+COLUMN");
    expect(breakingPattern).toContain("DROP[[:space:]]+CONSTRAINT");
    expect(breakingPattern).toContain("RENAME[[:space:]]+COLUMN");
    expect(breakingPattern).toContain("RENAME[[:space:]]+TO");
    expect(breakingPattern).toContain(
      "ALTER[[:space:]]+COLUMN[[:space:]]+.*(SET[[:space:]]+NOT[[:space:]]+NULL|DROP[[:space:]]+DEFAULT|TYPE)",
    );
    expect(breakingPattern).toContain("DROP[[:space:]]+CONSTRAINT");
    expect(breakingPattern).toContain("DROP[[:space:]]+TABLE");
    expect(breakingPattern).toContain("DROP[[:space:]]+TYPE");
  });

  test("workflow は grep の前に 1 文 1 行へ正規化する", () => {
    // これが無いと改行を挟んだ文が丸ごと判定をすり抜ける。上の
    // multi-line fixture 群はこの正規化を前提に評価している。
    expect(workflow).toContain("sed 's/--.*$//' \"${migration_file}\"");
    expect(workflow).toContain("tr '\\n' ' '");
    expect(workflow).toContain("tr ';' '\\n'");
  });

  describe("実 bash でパイプラインを流す（pipefail × SIGPIPE の fail-open 回帰）", () => {
    test("出力は捨てるだけで、grep に早期 exit させない", () => {
      // `-q` は最初のマッチで grep を終わらせる。上流の `tr` が閉じたパイプに
      // 書くと SIGPIPE で死に、pipefail がそれをパイプライン全体の status に
      // するので、`if` は**マッチしたのに**「不一致」を選ぶ。
      expect(detectionPipeline).toContain("> /dev/null");
      expect(detectionPipeline).not.toContain("-Eiq");
    });

    // 以下 3 本は組で意味を持つ。1 本目が「判定が実際に動いている」ことを、
    // 3 本目が「サイズを増やしただけで発動しない」ことを示すので、2 本目の
    // 緑が抽出失敗や常時 SAFE による空回りでないと言える。
    test("自己検査: 小さい破壊的 migration は検出される", () => {
      expect(
        runWorkflowDetection(
          'ALTER TABLE "users" DROP COLUMN "foo";\n',
          detectionPipeline,
        ),
      ).toBe("BREAKING");
    });

    test("破壊的文の後ろにパイプバッファ超の出力が続いても検出される", () => {
      // fail-open の条件はファイルサイズそのものではなく「最初のマッチ以降に
      // 残る出力が 64 KiB を超えるか」。破壊的文を先頭に置くのが最悪形で、
      // 実測ではこの形が rc=141 で素通りしていた。
      const sql =
        'ALTER TABLE "users" DROP COLUMN "foo";\n' +
        safePadding(PIPE_BUFFER_BYTES * 4);
      expect(runWorkflowDetection(sql, detectionPipeline)).toBe("BREAKING");
    });

    test("パイプバッファ超でも安全な migration は計画ダウンタイムに入れない", () => {
      // 見逃しを潰すために「常に BREAKING」へ倒すのは修正ではない。
      expect(
        runWorkflowDetection(
          safePadding(PIPE_BUFFER_BYTES * 4),
          detectionPipeline,
        ),
      ).toBe("SAFE");
    });
  });

  for (const fixture of breakingFixtures) {
    test(`detects breaking: ${fixture.name}`, () => {
      expect(detectsBreaking(fixture.sql, breakingRegex)).toBe(true);
    });
  }

  for (const fixture of safeFixtures) {
    test(`does not flag safe: ${fixture.name}`, () => {
      expect(detectsBreaking(fixture.sql, breakingRegex)).toBe(false);
    });
  }
  test("発動条件は前置詞を畳み込んだ完全修飾で導出される", () => {
    const derived = deriveTriggerProse(breakingPattern).sort();
    // 導出が壊れて空になると以降が空回りで緑になる（vacuous pass 防止）
    expect(derived.length).toBeGreaterThan(5);
    // 前置詞が畳み込まれていること（平坦化への逆戻りを検出）。
    // 平坦化すると `RENAME TO` が単独の条件に見え、発動しない
    // `ALTER INDEX ... RENAME TO` まで「停止する」と読める形になる。
    expect(derived).toContain("ALTER TABLE ... RENAME TO");
    expect(derived).toContain("ALTER TABLE ... ALTER COLUMN ... TYPE");
    // 前置詞を落とした素の語が単独の条件として残っていないこと
    expect(derived).not.toContain("RENAME TO");
    expect(derived).not.toContain("TYPE");
  });
});
