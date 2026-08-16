/**
 * 数値列が 1 本残らず値域を持つことの gate。
 *
 * ## 何が守られていなかったか
 *
 * `__tests__/integration/prisma/value-domain-constraints.test.ts` は
 * **存在する CHECK を列挙して 1 本ずつ違反 INSERT で確かめる**形で、これは
 * 「あるものが効いている」ことしか言わない。**足りないものは要求しない**ので、
 * 制約が無い列は永久に緑のままだった。実測: 数値列 84 本のうち **55 本**が無保護。
 *
 * DB が受理してしまっていた代表例:
 *
 * | 列 | 顧客に起きること |
 * | --- | --- |
 * | `space_reviews.rating` | 星の描画が壊れ、スペースの平均評価が狂う |
 * | `locations.latitude` / `longitude` | 地図が拠点と無関係な場所を指す |
 * | `settings_commerce.tax_standard_rate` | 予約側の税率 CHECK に弾かれ**予約が作れなくなる** |
 * | `event_registrations.paid_amount` | 返金額の計算根拠が負になる |
 *
 * 税率は特に非対称だった — `reservations_tax_rate_range_check` は 0..100 を
 * 強制しているのに、**その値を供給する設定側**には何も無かった。
 *
 * ## この gate の集合は schema.prisma の数値列そのもの
 *
 * 免除リストではなく**列の全体**を母集合にする。列を足せば分類するまで赤になり、
 * 「宣言し忘れ」が「黙って対象外」に化けない。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: すべての数値列が CHECK に覆われているか、覆わない理由が宣言されている。
 * 宣言した値域の CHECK 式は kind から導いた比較（`>= 0` / `> 0` 等）を含む。
 * 制約名は invariants.sql に実際に書かれている識別子が 63 バイトに収まる。
 *
 * **証明しない**: 境界値を実 DB に INSERT したときの拒否。それは
 * `__tests__/integration/prisma/numeric-column-domains.test.ts` の担当。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readDatabaseInvariants } from "../../support/prisma-sources";
import {
  NUMERIC_COLUMN_DOMAINS,
  POSTGRES_IDENTIFIER_MAX_BYTES,
  REORDER_SCRATCH_CEILING,
  UNBOUNDED_NUMERIC_COLUMNS,
  columnKey,
  constraintNameFor,
  constraintNameOverrideKeys,
  defaultConstraintNameFor,
  hasDedicatedNumericCheck,
  readChecksByTable,
  readNumericColumns,
  type NumericColumn,
  type NumericDomain,
} from "../../support/numeric-column-domains";

const COLUMNS = readNumericColumns();
/**
 * `buildUuidOrderSqlFragments` を使って order 列を書き換えるコマンド。
 *
 * `position`（退避領域を許す）という緩い分類の根拠になるので、リストが古くなると
 * 「reorder しない列まで緩めている」のを見逃す。実在確認は下のテストが行う。
 */
const REORDER_COMMAND_FILES: readonly string[] = [
  "src/shared/domain/event-categories/commands.ts",
  "src/shared/domain/events/event-slot-sync-commands.ts",
  "src/shared/domain/faq/category-commands.ts",
  "src/shared/domain/faq/item-commands.ts",
  "src/shared/domain/instagram/commands.ts",
  "src/shared/domain/locations/commands.ts",
  "src/shared/domain/navigation/commands.ts",
  "src/shared/domain/posts/category-commands.ts",
  "src/shared/domain/sections/commands.ts",
  "src/shared/domain/settings/announcement-bar.ts",
  "src/shared/domain/settings/transfer-account-commands.ts",
  "src/shared/domain/space-categories/commands.ts",
  "src/shared/domain/terms/commands.ts",
];

/** その表の CHECK 制約（制約名 → 式）。 */
const CHECKS = readChecksByTable();

/** 1 列専用 CHECK（`<表>_<列>_` 命名）で覆われているか。複合 CHECK の列名言及だけでは true にしない。 */
function isCoveredByDedicatedCheck(c: NumericColumn): boolean {
  return hasDedicatedNumericCheck(c);
}

const key = (c: NumericColumn): string => columnKey(c);

function mentionsColumn(expression: string, column: string): boolean {
  return new RegExp(`(?:^|[^a-z_"])"?${column}"?(?:$|[^a-z_"])`, "u").test(
    expression,
  );
}

function columnIdent(column: string): string {
  return `(?:"${column}"|${column})`;
}

function hasNumericComparison(expression: string, column: string): boolean {
  return new RegExp(`${columnIdent(column)}\\s*(?:>=|<=|>|<)`, "u").test(
    expression,
  );
}

/** kind から導いた比較が `pg_get_constraintdef` 正規形の式に含まれるか。 */
function hasKindPredicate(
  expression: string,
  column: string,
  domain: NumericDomain,
): boolean {
  const col = columnIdent(column);
  switch (domain.kind) {
    case "nonNegative":
      return new RegExp(`${col}\\s*>=\\s*0\\b`, "u").test(expression);
    case "positive":
      return new RegExp(`${col}\\s*(?:>\\s*0|>=\\s*1)\\b`, "u").test(
        expression,
      );
    case "range": {
      const bound = (value: number) =>
        value < 0 ? `(?:'-${-value}'|-\\s*${-value})` : String(value);
      const ge = new RegExp(
        `${col}[\\s\\S]{0,48}>=[\\s\\S]{0,48}${bound(domain.min)}`,
        "u",
      );
      const le = new RegExp(
        `${col}[\\s\\S]{0,48}<=[\\s\\S]{0,48}${bound(domain.max)}`,
        "u",
      );
      return ge.test(expression) && le.test(expression);
    }
    case "position": {
      const min =
        domain.min === 0 ? `${col}\\s*>=\\s*0\\b` : `${col}\\s*>=\\s*'-1'`;
      return (
        new RegExp(min, "u").test(expression) &&
        new RegExp(`${col}\\s*<=\\s*'-1000000'`, "u").test(expression)
      );
    }
  }
}

function expressionsForColumn(
  column: NumericColumn,
  domain: NumericDomain,
): string[] {
  const bucket = CHECKS.get(column.table);
  if (!bucket) return [];
  const named = constraintNameFor(column, domain);
  const out: string[] = [];
  const namedExpr = bucket.get(named);
  if (namedExpr !== undefined) out.push(namedExpr);
  for (const [name, expr] of bucket) {
    if (name === named) continue;
    if (mentionsColumn(expr, column.column)) out.push(expr);
  }
  return out;
}

function collectReorderedColumns(files: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of source.matchAll(
      /UPDATE\s+"?(\w+)"?[\s\S]{0,120}?SET\s+"?(\w+)"?/gu,
    )) {
      if (m[1] && m[2]) out.add(`${m[1]}.${m[2]}`);
    }
    for (const c of COLUMNS) {
      if (NUMERIC_COLUMN_DOMAINS[key(c)]?.kind !== "position") continue;
      const delegate = `${c.model[0]?.toLowerCase() ?? ""}${c.model.slice(1)}`;
      if (
        new RegExp(
          `\\b${delegate}\\.(?:create|createMany|update|updateMany|upsert)\\b`,
          "u",
        ).test(source) &&
        new RegExp(`\\b${c.field}\\b`, "u").test(source)
      ) {
        out.add(`${c.table}.${c.column}`);
      }
    }
  }
  return out;
}

describe("数値列の値域", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // パースが壊れると以降の assertion が全部 vacuous に通る。
    expect(COLUMNS.length).toBeGreaterThan(70);
    expect(CHECKS.size).toBeGreaterThan(30);
    // 母集合と制約の突き合わせが機能していることを、既存の 1 本で確かめる。
    const taxRate = COLUMNS.find((c) => key(c) === "Reservation.taxRate");
    expect(taxRate && isCoveredByDedicatedCheck(taxRate)).toBe(true);
    // BigInt を母集合から落とすと AuditLog.sequence が黙って対象外になる（F-77）。
    const sequence = COLUMNS.find((c) => key(c) === "AuditLog.sequence");
    expect(sequence).toBeDefined();
    expect(NUMERIC_COLUMN_DOMAINS["AuditLog.sequence"]?.kind).toBe("positive");
    expect(
      sequence &&
        CHECKS.get(sequence.table)?.has(
          constraintNameFor(sequence, { kind: "positive" }),
        ),
    ).toBe(true);
  });

  test("すべての数値列が CHECK に覆われている", () => {
    const unprotected = COLUMNS.filter(
      (c) =>
        !isCoveredByDedicatedCheck(c) && !(key(c) in NUMERIC_COLUMN_DOMAINS),
    )
      .filter((c) => !(key(c) in UNBOUNDED_NUMERIC_COLUMNS))
      .map((c) => `${key(c)} (${c.table}.${c.column}) に値域 CHECK が無い`);

    expect(unprotected).toEqual([]);
  });

  test("宣言した値域に対応する CHECK が実在する", () => {
    const missing = Object.entries(NUMERIC_COLUMN_DOMAINS).flatMap(
      ([k, domain]) => {
        const column = COLUMNS.find((c) => key(c) === k);
        if (!column) return [`${k}: schema.prisma に無い（改名・削除された）`];
        const name = constraintNameFor(column, domain);
        return CHECKS.get(column.table)?.has(name) === true
          ? []
          : [`${k}: 制約 ${name} が invariants.sql に無い`];
      },
    );

    expect(missing).toEqual([]);
  });

  test("宣言した値域の CHECK 式は kind から導いた比較を含む", () => {
    const wrong = Object.entries(NUMERIC_COLUMN_DOMAINS).flatMap(
      ([k, domain]) => {
        const column = COLUMNS.find((c) => key(c) === k);
        if (!column) return [];
        const exprs = expressionsForColumn(column, domain);
        const mustPin =
          hasDedicatedNumericCheck(column) ||
          exprs.some((expr) => hasNumericComparison(expr, column.column));
        if (!mustPin) return [];
        return exprs.some((expr) =>
          hasKindPredicate(expr, column.column, domain),
        )
          ? []
          : [
              `${k}: 制約式に ${domain.kind} の比較が無い — ${exprs.join(" / ")}`,
            ];
      },
    );

    expect(wrong).toEqual([]);
  });

  test("値域を持たせない宣言は実在する列に対してだけ書かれている", () => {
    const known = new Set(COLUMNS.map(key));
    const stale = Object.keys(UNBOUNDED_NUMERIC_COLUMNS).filter(
      (k) => !known.has(k),
    );

    expect(stale).toEqual([]);
  });

  test("制約名が PostgreSQL の識別子上限に収まっている", () => {
    // 超えた分は **黙って切り捨てられる**。付けたつもりの名前と実際の名前が
    // 食い違い、名前で引く検査が「別の制約を見ている」状態になる。
    // 宣言から導出した名前だけでなく、invariants.sql に実際に書かれている
    // 識別子も測る（76 バイト名を SQL に足す変異を宣言側だけでは見逃す）。
    const derived = Object.entries(NUMERIC_COLUMN_DOMAINS).flatMap(
      ([k, domain]) => {
        const column = COLUMNS.find((c) => key(c) === k);
        if (!column) return [];
        const name = constraintNameFor(column, domain);
        const bytes = Buffer.byteLength(name, "utf8");
        return bytes <= POSTGRES_IDENTIFIER_MAX_BYTES
          ? []
          : [
              `${k}: 制約名 ${bytes} バイト（上限 ${POSTGRES_IDENTIFIER_MAX_BYTES}）`,
            ];
      },
    );
    const written = new Set<string>();
    for (const bucket of CHECKS.values()) {
      for (const name of bucket.keys()) written.add(name);
    }
    for (const m of readDatabaseInvariants().matchAll(
      /ADD CONSTRAINT "([^"]+)"/gu,
    )) {
      if (m[1]) written.add(m[1]);
    }
    const actual = [...written].flatMap((name) => {
      const bytes = Buffer.byteLength(name, "utf8");
      return bytes <= POSTGRES_IDENTIFIER_MAX_BYTES
        ? []
        : [`${name}: ${bytes} バイト（上限 ${POSTGRES_IDENTIFIER_MAX_BYTES}）`];
    });

    expect([...derived, ...actual]).toEqual([]);
  });

  test("短縮名の override は本当に必要なものだけ", () => {
    // 「収まるのに override がある」も落とす。理由の無い別名は次の人を惑わせる。
    const unnecessary = constraintNameOverrideKeys().flatMap((k) => {
      const column = COLUMNS.find((c) => key(c) === k);
      const domain = NUMERIC_COLUMN_DOMAINS[k];
      if (!column || !domain) return [`${k}: 宣言に無い列の override`];
      const bytes = Buffer.byteLength(
        defaultConstraintNameFor(column, domain),
        "utf8",
      );
      return bytes > POSTGRES_IDENTIFIER_MAX_BYTES
        ? []
        : [`${k}: 既定名は ${bytes} バイトで収まる。override を外す`];
    });

    expect(unnecessary).toEqual([]);
  });

  test("並び替えの退避領域が order-sql.ts と一致している", () => {
    // `position` 列の CHECK は「実際の位置」と「reorder の退避領域」の 2 領域を
    // 許す。境界は `TEMP_ORDER_BASE` そのものなので、**片方だけ動くと
    // 並び替えが本番で 23514 になる**（退避先が CHECK の外へ出る）。
    // 実装のソースを直接読んで突き合わせる。
    const source = readFileSync(
      join(process.cwd(), "src/shared/domain/order-sql.ts"),
      "utf8",
    );
    const declared = /const TEMP_ORDER_BASE = (-?[\d_]+);/u.exec(source)?.[1];

    expect(declared).toBeDefined();
    expect(Number((declared ?? "").replaceAll("_", ""))).toBe(
      REORDER_SCRATCH_CEILING,
    );
  });

  test("固定先頭の番兵は実際に書き込むコードがある列だけに許す", () => {
    // `min` を 0 より下げるのは「その値を書くコードが実在する」ときだけ。
    // 実測: `page-hero` の `order = -1`（sections/commands.ts）を見落として
    // seed が 23514 で落ちた。根拠をソースから確かめて、憶測で緩めない。
    const pinned = Object.entries(NUMERIC_COLUMN_DOMAINS).filter(
      ([, d]) => d.kind === "position" && d.min < 0,
    );
    // 番兵を 1 件も拾えていないなら、この検査は何も見ていない。
    expect(pinned.map(([k]) => k)).toEqual(["Section.order"]);

    const source = readFileSync(
      join(process.cwd(), "src/shared/domain/sections/commands.ts"),
      "utf8",
    );
    const sentinel = /"page-hero"\s*\?\s*(-?\d+)\s*:/u.exec(source)?.[1];
    const declared = pinned[0]?.[1];

    expect(sentinel).toBeDefined();
    expect(declared?.kind === "position" ? declared.min : undefined).toBe(
      Number(sentinel),
    );
  });

  test("退避領域を許す列は reorder が実際に書き換える列である", () => {
    // `position` は `nonNegative` より緩い。緩めてよいのは reorder の
    // 退避先になる列だけなので、その根拠（reorder コマンドの UPDATE 対象）を
    // ソースから確かめる。根拠の無い緩和は落とす。
    const reorderedColumns = collectReorderedColumns(REORDER_COMMAND_FILES);
    // 走査が壊れたら以降が vacuous に通る。
    expect(reorderedColumns.size).toBeGreaterThan(5);

    const ungrounded = Object.entries(NUMERIC_COLUMN_DOMAINS)
      .filter(([, domain]) => domain.kind === "position")
      .flatMap(([k]) => {
        const column = COLUMNS.find((c) => key(c) === k);
        if (!column) return [];
        return reorderedColumns.has(`${column.table}.${column.column}`)
          ? []
          : [`${k}: reorder が書き換えない列を position にしている`];
      });

    expect(ungrounded).toEqual([]);
  });

  test("複合 CHECK の列は NUMERIC_COLUMN_DOMAINS に宣言されている", () => {
    const compositeOnly = COLUMNS.filter(
      (c) =>
        !hasDedicatedNumericCheck(c) &&
        !(key(c) in UNBOUNDED_NUMERIC_COLUMNS) &&
        [...(readChecksByTable().get(c.table)?.values() ?? [])].some((expr) =>
          new RegExp(`(?:^|[^a-z_"])"?${c.column}"?(?:$|[^a-z_"])`, "u").test(
            expr,
          ),
        ),
    ).map((c) => key(c));

    expect(compositeOnly.length).toBeGreaterThan(10);
    const missing = compositeOnly.filter((k) => !(k in NUMERIC_COLUMN_DOMAINS));
    expect(missing).toEqual([]);
  });

  test("同じ列を二重に宣言していない", () => {
    // 値域を持たせつつ「持たせない理由」も書いてある状態は、どちらかが嘘。
    const both = Object.keys(NUMERIC_COLUMN_DOMAINS).filter(
      (k) => k in UNBOUNDED_NUMERIC_COLUMNS,
    );

    expect(both).toEqual([]);
  });
});
