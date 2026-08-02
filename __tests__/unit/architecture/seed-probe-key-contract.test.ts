import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * seed の「存在判定」と「一意列への書き込み」が **schema の制約と噛み合う**ことの gate。
 *
 * ## 何が壊れるか
 *
 * `findFirst` で存在を見て無ければ `create` する形は seed の定番だが、判定キーと
 * 制約キーがずれていると**再実行が P2002 で中断**する。seed は `main().catch` で
 * `process.exit(1)` するので、そこから後ろの phase が丸ごと走らない。Playwright の
 * webServer chain は seed → build → start なので、**ローカルの E2E スイートが
 * そもそも起動しなくなる**。
 *
 * 実測（このリポジトリで踏んだもの）:
 *
 * ```
 * ❌ Seed failed: Unique constraint failed on the fields: (`type`, `"order"`)
 * ```
 *
 * `seedNavigation` は `(type, url)` で判定していたが制約は `@@unique([type, order])`。
 * url だけがずれた行（管理画面の `updateNavigationItem` は url を書き換えて order を
 * 据え置く／過去コミットの seed が別 url を入れた）があると、「無い」と判定して
 * 同じ order で create し衝突する。
 *
 * ## 2 つの不変条件（どちらも schema 駆動・表を持たない）
 *
 * 1. **unique に参加する列へリテラルを create しない。** 配列の宣言順や index から
 *    literal で書かれがちだが、管理画面の並び替え・追加で既存行がその値を占有して
 *    いると即衝突する。正しい形は「max + 1 で採番」（`seedSpaceCategories` が手本）か
 *    「その値自体を upsert の where キーにする」（`seedNavigation`）。
 *    どの列が unique かは **schema から読む**ので、`TransferAccount.sortOrder` のような
 *    index だけの列は対象外になる。
 *
 * 2. **partial unique を持つ model の存在判定は、その述語を where に含める。**
 *    `@@unique([...], where: { deletedAt: null })` の母集合は未削除行だけ。
 *    削除済み行を「存在する」と数えると create をスキップして表示が欠け、
 *    無視すると位置列が衝突する。判定対象は「その unique の列で引いている probe」
 *    だけに絞る（`where: { status }` のような読み取りクエリは対象外）。
 */

const root = process.cwd();
const SEED = join(root, "prisma/seed.ts");
const SCHEMA = join(root, "prisma/schema.prisma");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * 一意列にリテラルを書いてよい唯一の場所。
 *
 * `SEED_NAVIGATION_GROUPS` の `order` は **upsert の where キーそのもの**
 * （`where: { type_order: { type, order } }`）なので、宣言された値がそのまま
 * 一意キーになる。採番の余地がなく、衝突もしえない。
 */
const LITERAL_ALLOWED_BLOCK = "SEED_NAVIGATION_GROUPS";

interface PartialUnique {
  readonly model: string;
  readonly fields: readonly string[];
  readonly predicateFields: readonly string[];
}

function modelBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const model of read(SCHEMA).matchAll(
    /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gmu,
  )) {
    bodies.set(String(model[1]), String(model[2]));
  }
  return bodies;
}

/** `@@unique([...], where: {...})` を持つものだけ。 */
function readPartialUniques(): PartialUnique[] {
  const found: PartialUnique[] = [];
  for (const [model, body] of modelBodies()) {
    for (const u of body.matchAll(/@@unique\(\[([^\]]+)\]([^)]*)\)/gu)) {
      const predicate = /where:\s*\{([^}]*)\}/u.exec(String(u[2]));
      if (!predicate?.[1]) continue;
      found.push({
        model,
        fields: String(u[1])
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0),
        predicateFields: [...predicate[1].matchAll(/(\w+)\s*:/gu)].map((m) =>
          String(m[1]),
        ),
      });
    }
  }
  return found;
}

/** model → unique（複合・partial・単一 `@unique` すべて）に参加する列。 */
function readUniqueColumns(): Map<string, Set<string>> {
  const byModel = new Map<string, Set<string>>();
  for (const [model, body] of modelBodies()) {
    const columns = new Set<string>();
    for (const u of body.matchAll(/@@unique\(\[([^\]]+)\]/gu)) {
      for (const field of String(u[1]).split(",")) {
        columns.add(field.trim());
      }
    }
    for (const line of body.split("\n")) {
      const single = /^\s+(\w+)\s+\S+.*@unique/u.exec(line);
      if (single?.[1]) columns.add(single[1]);
    }
    if (columns.size > 0) byModel.set(model, columns);
  }
  return byModel;
}

function toClientProperty(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function toModelName(clientProperty: string): string {
  return clientProperty.charAt(0).toUpperCase() + clientProperty.slice(1);
}

interface SeedFunction {
  readonly name: string;
  readonly startLine: number;
  readonly body: string;
}

/** seed.ts を top-level 関数単位に切る。 */
function seedFunctions(): SeedFunction[] {
  const lines = read(SEED).split("\n");
  const starts: { name: string; index: number }[] = [];
  lines.forEach((line, index) => {
    const match = /^(?:async\s+)?function\s+(\w+)/u.exec(line);
    if (match?.[1]) starts.push({ name: match[1], index });
  });

  return starts.map((start, i) => ({
    name: start.name,
    startLine: start.index,
    body: lines
      .slice(start.index, starts[i + 1]?.index ?? lines.length)
      .join("\n"),
  }));
}

interface Violation {
  readonly line: number;
  readonly message: string;
}

/**
 * 関数が書き込む model の unique 列に、リテラルを書いている行。
 *
 * 「その関数が書く model」で絞るので、同名の列でも unique でない model
 * （`TransferAccount.sortOrder` は index のみ）は誤検知しない。
 */
function findLiteralUniqueWrites(): Violation[] {
  const uniqueColumns = readUniqueColumns();
  const violations: Violation[] = [];

  for (const fn of seedFunctions()) {
    if (fn.body.includes(`const ${LITERAL_ALLOWED_BLOCK} =`)) continue;

    const written = new Set(
      [...fn.body.matchAll(/prisma\.(\w+)\.(?:create|createMany|upsert)\(/gu)]
        .map((m) => toModelName(String(m[1])))
        .filter((model) => uniqueColumns.has(model)),
    );
    if (written.size === 0) continue;

    const columns = new Set<string>();
    for (const model of written) {
      for (const column of uniqueColumns.get(model) ?? []) columns.add(column);
    }
    if (columns.size === 0) continue;

    const pattern = new RegExp(
      `\\b(${[...columns].join("|")}):\\s*(\\d+|i)\\s*,`,
      "u",
    );

    fn.body.split("\n").forEach((line, offset) => {
      const match = pattern.exec(line);
      if (!match) return;
      violations.push({
        line: fn.startLine + offset + 1,
        message: `${fn.name} — ${line.trim()} は unique 列にリテラルを書いている（${[...written].join(" / ")}）。並び替え・追加で既存行がその値を占有していると再実行が P2002 で中断する。max + 1 で採番するか、その値を upsert の where キーにすること`,
      });
    });
  }

  return violations;
}

/** `prisma.<model>.findFirst({ where: { ... } })` の where 直下キー。 */
function probeWhereKeys(clientProperty: string): string[][] {
  const pattern = new RegExp(
    `prisma\\.${clientProperty}\\.findFirst\\(\\{[\\s\\S]{0,120}?where:\\s*\\{([^{}]*)\\}`,
    "gu",
  );
  return [...read(SEED).matchAll(pattern)].map((m) =>
    [...String(m[1]).matchAll(/(\w+)\s*:/gu)].map((k) => String(k[1])),
  );
}

describe("seed と schema の一意制約が噛み合っている", () => {
  test("gate が空振りしていない", () => {
    expect(readPartialUniques().length).toBeGreaterThan(0);
    expect(readUniqueColumns().size).toBeGreaterThan(0);
    expect(seedFunctions().length).toBeGreaterThan(10);
    // unique 列を持つ model を書く関数が実在すること（絞り込みが効きすぎていない）。
    expect(
      seedFunctions().some((fn) =>
        /prisma\.\w+\.(?:create|upsert)\(/u.test(fn.body),
      ),
    ).toBe(true);
  });

  test("unique 列にリテラルを create しない", () => {
    expect(
      findLiteralUniqueWrites().map(
        (v) => `prisma/seed.ts:${String(v.line)} ${v.message}`,
      ),
    ).toEqual([]);
  });

  test("allowlist は upsert キーとして使う 1 ブロックだけ", () => {
    const source = read(SEED);
    // 宣言された order が where キーとして実際に使われていることを確認する。
    // 使われていないなら単なるリテラル書き込みなので allowlist は無効。
    expect(source).toContain(`const ${LITERAL_ALLOWED_BLOCK} =`);
    expect(source).toContain("where: { type_order: {");
  });

  test("partial unique の列で引く存在判定は述語を含む", () => {
    const violations = readPartialUniques().flatMap((partial) => {
      const clientProperty = toClientProperty(partial.model);
      return (
        probeWhereKeys(clientProperty)
          // その unique の列で引いている probe だけが対象。
          // `where: { status }` のような読み取りクエリは制約と無関係。
          .filter((keys) => keys.some((key) => partial.fields.includes(key)))
          .flatMap((keys, index) =>
            partial.predicateFields
              .filter((field) => !keys.includes(field))
              .map(
                (field) =>
                  `prisma.${clientProperty}.findFirst #${String(index + 1)}: where に "${field}" が無い。${partial.model} の (${partial.fields.join(", ")}) unique は ${field} 条件の partial index なので、判定の母集合を制約の述語に揃える必要がある`,
              ),
          )
      );
    });

    expect(violations).toEqual([]);
  });

  test("ナビゲーションは制約と同じキーで存在判定する", () => {
    // `(type, url)` で判定して order をリテラル create していた旧実装への逆戻り検出。
    expect(read(SEED)).not.toMatch(
      /navigationItem\.findFirst\([\s\S]{0,120}?url:/u,
    );
  });
});
