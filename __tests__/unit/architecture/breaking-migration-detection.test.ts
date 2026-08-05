import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

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

const workflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
  "utf8",
);

/**
 * Extract the POSIX ERE pattern from the `grep -Eiq '...'` invocation in
 * deploy-production.yml so the test always reflects what the workflow will
 * actually run. Fails loudly if the pattern moves or the extraction breaks.
 */
function extractBreakingMigrationPattern(): string {
  const match = workflow.match(/grep -Eiq '(?<pattern>[^']+)'/u);
  const pattern = match?.groups?.["pattern"];
  if (!pattern) {
    throw new Error(
      "Could not extract breaking-migration grep pattern from deploy-production.yml. " +
        "If the grep call moved or its quoting changed, update this test.",
    );
  }
  return pattern;
}

/**
 * Translate the POSIX ERE pattern to a JavaScript RegExp so bun test can
 * evaluate fixtures the same way `grep -Ei` would on Cloud Build.
 * Only `[[:space:]]` is used in the source pattern; expand more classes if
 * new ones are added.
 */
function posixEreToJsRegExp(pattern: string): RegExp {
  const translated = pattern.replaceAll("[[:space:]]", "\\s");
  return new RegExp(translated, "i");
}

const breakingPattern = extractBreakingMigrationPattern();
const breakingRegex = posixEreToJsRegExp(breakingPattern);

/**
 * Mirror the workflow's pre-grep normalization:
 *
 *     sed 's/--.*$//' file | tr '\n' ' ' | tr ';' '\n'
 *
 * grep matches **line by line**, so a statement wrapped across lines —
 *
 *     ALTER TABLE "terms_agreements"
 *       ALTER COLUMN "resourceId" SET DATA TYPE TEXT;
 *
 * — satisfies the pattern on neither line and slips through entirely. That is
 * not hypothetical: a merged migration that split `ALTER TABLE` from
 * `ALTER COLUMN ... SET DATA TYPE` across lines returned rc=1 against the old
 * single-`grep` call, so it would have deployed without downtime mode.
 *
 * Splitting on `;` matters just as much as joining lines: without it, two
 * unrelated adjacent statements get bridged by `.*` and produce false
 * positives (e.g. `ALTER TABLE a ADD COLUMN b;` followed by anything
 * containing `TYPE`).
 */
function normalizeMigrationSql(sql: string): string[] {
  return sql.replace(/--.*$/gmu, "").replaceAll("\n", " ").split(";");
}

/** grep が行ごとに評価するのと同じく、正規化後の各文に対して照合する。 */
function detectsBreaking(sql: string): boolean {
  return normalizeMigrationSql(sql).some((statement) =>
    breakingRegex.test(statement),
  );
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
  // 20260804085847 が実際にこの状態で書かれていた。
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
 * ドキュメントは「RENAME TO は停止する」と読める形になっていた。実際には
 * `ALTER INDEX ... RENAME TO`（Prisma が index の `map` 変更で出す）は
 * **発動しない**（実測で確認）。4 つのドキュメントが揃って同じ誤りを書いても、
 * 語の一致しか見ない検査では気づけない。
 *
 * 正規表現の入れ子（`ALTER TABLE .*( … | ALTER COLUMN .*( … ) )`）をそのまま
 * 前置詞として畳み込み、`ALTER TABLE ... ALTER COLUMN ... TYPE` のような
 * 完全修飾の表記を作る。これでドキュメント側は導出結果と集合一致するだけでよく、
 * 対応表の drift という失敗モード自体が無くなる。
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

const TRIGGER_BLOCK_START = "<!-- breaking-triggers:start -->";
const TRIGGER_BLOCK_END = "<!-- breaking-triggers:end -->";

/**
 * ドキュメント中の marker で囲まれた列挙を、` / ` 区切りの集合として取り出す。
 *
 * **本文全体を走査しない。** 例えば migrations.md は squawk 節や
 * 「既存 migration 編集禁止」節でも `DROP COLUMN` に言及するので、
 * 全文から語を拾うと「余分な語」の検出が誤検知だらけになる。
 * 列挙だけを marker で切り出せば、集合の完全一致で比較できる。
 */
function readTriggerBlock(relativePath: string): string[] {
  const doc = readFileSync(join(process.cwd(), relativePath), "utf8");
  const start = doc.indexOf(TRIGGER_BLOCK_START);
  const end = doc.indexOf(TRIGGER_BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${relativePath} に ${TRIGGER_BLOCK_START} / ${TRIGGER_BLOCK_END} の対が見つかりません。` +
        "発動条件の列挙は marker で囲む（全文走査だと他文脈の DDL 言及と区別できない）。",
    );
  }
  return doc
    .slice(start + TRIGGER_BLOCK_START.length, end)
    .replace(/\s+/gu, " ")
    .split("/")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * 発動条件を「網羅的な一覧」として書いている文書。
 *
 * **AGENTS.md はここに入る。** 一度は「列挙しない側」に分類したが、実際の本文は
 * 全条件を並べていた。列挙を持つ文書を弱い検査（ポインタの有無だけ）に置くと、
 * workflow に条件が増えたとき「`deploy-production.yml` と書いてあるから合格」に
 * なってしまい、ルート指示がまた古いまま残る。**列挙しているなら網羅検査に載せる。**
 */
const TRIGGER_LIST_DOCS: readonly string[] = [
  "AGENTS.md",
  ".claude/rules/deploy-infra.md",
  ".claude/rules/migrations.md",
  ".claude/skills/deploy-debug/SKILL.md",
];

/**
 * 発動条件を列挙はしないが breaking mode に言及する文書。列挙を持たせると
 * 必ず drift するので、**SSoT の場所を指していること**だけを求める。
 * （AGENTS.md は以前「`ALTER COLUMN TYPE` は計画ダウンタイムを発動しない
 * （DROP/RENAME だけ）」と**事実と逆**のことを書いていた。）
 */
const SSOT_POINTER_DOCS: readonly string[] = ["CLAUDE.md"];
const SSOT_POINTER = "deploy-production.yml";

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

  for (const fixture of breakingFixtures) {
    test(`detects breaking: ${fixture.name}`, () => {
      expect(detectsBreaking(fixture.sql)).toBe(true);
    });
  }

  for (const fixture of safeFixtures) {
    test(`does not flag safe: ${fixture.name}`, () => {
      expect(detectsBreaking(fixture.sql)).toBe(false);
    });
  }
  test("運用者向けドキュメントの発動条件一覧が workflow と完全一致する", () => {
    const derived = deriveTriggerProse(breakingPattern).sort();
    // 導出が壊れて空になると以降が空回りで緑になる（vacuous pass 防止）
    expect(derived.length).toBeGreaterThan(5);
    // 前置詞が畳み込まれていること（平坦化への逆戻りを検出）
    expect(derived).toContain("ALTER TABLE ... RENAME TO");
    expect(derived).toContain("ALTER TABLE ... ALTER COLUMN ... TYPE");

    // 不足だけでなく余分も見る。条件を減らしたのにドキュメントに残すと、
    // 運用者は「まだ停止する」と誤読して不要な計画停止を組む。
    const mismatches: string[] = [];
    for (const relativePath of TRIGGER_LIST_DOCS) {
      const documented = readTriggerBlock(relativePath).sort();
      if (JSON.stringify(documented) !== JSON.stringify(derived)) {
        const missing = derived.filter((item) => !documented.includes(item));
        const extra = documented.filter((item) => !derived.includes(item));
        mismatches.push(
          `${relativePath}: 不足=[${missing.join(", ")}] 余分=[${extra.join(", ")}]`,
        );
      }
    }

    expect({
      mismatches,
      hint:
        mismatches.length > 0
          ? "deploy-production.yml の正規表現を変えたら、各ドキュメントの breaking-triggers ブロックも導出結果と同じ集合にする。不足は「停止しない」と誤読させ、余分は不要な計画停止を組ませる"
          : "",
    }).toEqual({ mismatches: [], hint: "" });
  });

  test("列挙を持たない文書は SSoT の場所を指している", () => {
    // ここに一覧を書くと必ず drift するので、指す先だけを固定する。
    const missingPointer = SSOT_POINTER_DOCS.filter((relativePath) => {
      const doc = readFileSync(join(process.cwd(), relativePath), "utf8");
      return !doc.includes(SSOT_POINTER);
    });

    expect({
      missingPointer,
      hint:
        missingPointer.length > 0
          ? `breaking mode に触れる文書は発動条件を列挙せず ${SSOT_POINTER} を指す`
          : "",
    }).toEqual({ missingPointer: [], hint: "" });
  });
});
