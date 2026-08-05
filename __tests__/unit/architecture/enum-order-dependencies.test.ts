/**
 * enum 列で並べ替えているコードが、**その enum の宣言順に依存している**ことを
 * 明示し、順序が動いたら落ちるようにする gate。
 *
 * ## なぜ要るのか
 *
 * PostgreSQL の enum は**宣言順**でソートする。だから `orderBy: { <enum列>: "asc" }`
 * と書いた瞬間、schema.prisma の値の並びが**アプリの挙動そのもの**になる。
 * 並べ替え・値の挿入は型検査にもテストにも引っかからないのに、順序だけが変わる。
 *
 * 現に 3 箇所ある:
 *
 * | 使っている場所 | 依存している順序 | 変わると |
 * | --- | --- | --- |
 * | `reservations/availability.ts`（休業日 cascade） | `GLOBAL` < `LOCATION` < `SPACE` | 全社休業日よりスペース単位の理由が優先され、**表示される休業理由が変わる** |
 * | `events/waitlist-queries.ts`（キャンセル待ち一覧） | `WAITLISTED` < `WAITLISTED_OFFERED` | オファー済みが待機中より下に沈み、**管理者が見落として 24 時間の期限が切れる** |
 * | `users/queries.ts`（スタッフ一覧の権限列） | `SUPER_ADMIN` < … < `VIEWER` < `USER` | 権限順に並ばなくなり、スタッフ一覧で管理者を追えなくなる |
 *
 * 1 つ目は実 DB テスト（`cascade-priority.test.ts`）が守っていた。2 つ目は何も
 * 守っておらず、この gate が見つけた。3 つ目は**この gate 自身の取りこぼし**で、
 * レビューで指摘されて分かった（PR #1955）。
 *
 * ## 並び順のキーは AST で読む
 *
 * 最初は `orderBy:` を正規表現で拾っていた。それでは
 *
 *   - `orderBy: { [sortBy]: sortOrder }`（計算されたキー）
 *   - `orderBy: ORDER_BY_UPDATED`（定数参照）
 *   - `orderBy: [{ a }, { b }]` の **2 要素目以降**
 *
 * が全部読めない。実際に 1 つ目で `User.role` の並べ替えを丸ごと落としていた。
 * 正規表現を広げるのではなく AST に移してある（順序・スコープ・入れ子を含む
 * 不変条件に正規表現を使わない、というのは `require-trimmed-text` /
 * `seed-respects-unique-constraints` と同じ判断）。
 *
 * **同一ファイル内なら定数も関数の戻り値も辿る。辿れなければ通さない。**
 * 「読めなかった＝安全」にした瞬間、計算されたキーが黙って素通りする。
 * import された値を `orderBy` に渡したい場合は、その値をこのファイルへ持ってくる。
 *
 * ## 母集合は「enum 列 × orderBy」
 *
 * 免除リストではなく、schema.prisma の enum 列と src の `orderBy` の交差を取る。
 * enum 列で並べ替えるコードを新しく書くと、依存する順序を宣言するまで赤くなる。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: `orderBy` の並び順キーがすべて静的に読めており、enum 列で
 * 並べ替えている箇所がすべて宣言されており、宣言した「この値はこの値より先」が
 * schema.prisma の宣言順と一致する。
 *
 * **証明しない**: その順序がプロダクトとして正しいこと。`asc` / `desc` の
 * 取り違えもここでは分からない。休業日 cascade はその先まで
 * `__tests__/integration/domain/blocked-dates/cascade-priority.test.ts` が
 * 実際に行を入れて確かめている。
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  createSourceFile,
  forEachChild,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBlock,
  isCallExpression,
  isComputedPropertyName,
  isConditionalExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isReturnStatement,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isStringLiteralLike,
  isVariableDeclaration,
  type Expression,
  type Node,
  type ObjectLiteralExpression,
} from "typescript";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = process.cwd();

/** enum 型の名前 → 宣言順の値。 */
function enumDeclarations(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const schema = readPrismaSchema();
  for (const block of schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gmu)) {
    const name = block[1];
    const body = block[2];
    if (!name || body === undefined) continue;
    const values: string[] = [];
    for (const raw of body.split(/\r?\n/u)) {
      const line = raw.replace(/\/\/.*$/u, "").trim();
      if (!line || line.startsWith("@@") || line.startsWith("///")) continue;
      const value = /^(\w+)/u.exec(line)?.[1];
      if (value) values.push(value);
    }
    out.set(name, values);
  }
  return out;
}

const ENUMS = enumDeclarations();

/** enum 型が付いた列の field 名 → その enum 型名（複数モデルで同名なら全部）。 */
function enumBackedFields(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let model: string | null = null;
  for (const raw of readPrismaSchema().split(/\r?\n/u)) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;
    const decl = /^\s*(\w+)\s+(\w+)(\[\])?\??/u.exec(line);
    if (!decl?.[1] || !decl[2] || !ENUMS.has(decl[2])) continue;
    const bucket = out.get(decl[1]) ?? new Set<string>();
    bucket.add(decl[2]);
    out.set(decl[1], bucket);
  }
  return out;
}

const ENUM_FIELDS = enumBackedFields();

interface OrderByUse {
  readonly file: string;
  readonly field: string;
}

/** 解決できなかった `orderBy`。件数 0 を強制する。 */
interface UnresolvedOrderBy {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

function unwrap(expression: Expression): Expression {
  if (
    isAsExpression(expression) ||
    isSatisfiesExpression(expression) ||
    isParenthesizedExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

/**
 * `{ sort: "asc", nulls: "last" }` か（Prisma の `SortOrderInput`）。
 *
 * `{ space: { name: "asc" } }`（リレーション経由の並び）と形が同じなので、
 * キーで見分ける。見分けないと `{ lastReservationAt: { sort, nulls } }` の
 * 並ぶ列を `sort` / `nulls` と読んでしまう。
 */
function isSortOrderInput(node: ObjectLiteralExpression): boolean {
  const keys = node.properties.map((property) =>
    property.name !== undefined &&
    (isIdentifier(property.name) || isStringLiteralLike(property.name))
      ? property.name.text
      : null,
  );
  return (
    keys.length > 0 &&
    keys.every((key) => key === "sort" || key === "nulls") &&
    keys.includes("sort")
  );
}

/** 関数本体が返す式（`return e` と簡潔記法のアロー）。 */
function returnedExpressions(fn: Node): Expression[] {
  const out: Expression[] = [];
  if (
    (isArrowFunction(fn) ||
      isFunctionExpression(fn) ||
      isFunctionDeclaration(fn)) &&
    fn.body !== undefined &&
    !isBlock(fn.body)
  ) {
    out.push(fn.body);
    return out;
  }
  const walk = (node: Node): void => {
    // 入れ子の関数の return は自分のものではない。
    if (
      isArrowFunction(node) ||
      isFunctionExpression(node) ||
      isFunctionDeclaration(node)
    ) {
      return;
    }
    if (isReturnStatement(node) && node.expression !== undefined) {
      out.push(node.expression);
    }
    forEachChild(node, walk);
  };
  forEachChild(fn, walk);
  return out;
}

/**
 * 1 ファイルの `orderBy` を読む。
 *
 * **同一ファイル内なら定数も関数の戻り値も辿る。** 辿れないもの（他ファイルから
 * import した値、計算されたキー、spread）は `unresolved` に入れて 0 件を強制する。
 * 「読めなかった＝安全」にすると、`orderBy: { [sortBy]: … }` のような書き方が
 * 黙って素通りする（実際にそうなっていた）。
 */
function readOrderBy(
  file: string,
  source: string,
): { uses: OrderByUse[]; unresolved: UnresolvedOrderBy[] } {
  const sourceFile = createSourceFile(
    file,
    source,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );

  const values = new Map<string, Expression>();
  const functions = new Map<string, Node>();
  const collect = (node: Node): void => {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer);
      if (isArrowFunction(initializer) || isFunctionExpression(initializer)) {
        functions.set(node.name.text, initializer);
      } else {
        values.set(node.name.text, node.initializer);
      }
    }
    if (isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
    }
    forEachChild(node, collect);
  };
  collect(sourceFile);

  const uses: OrderByUse[] = [];
  const unresolved: UnresolvedOrderBy[] = [];
  const lineOf = (node: Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;

  const resolve = (expression: Expression, at: Node, seen: Set<Node>): void => {
    const node = unwrap(expression);
    if (seen.has(node)) return;
    seen.add(node);

    if (isArrayLiteralExpression(node)) {
      // 配列は「第 1 キーが同値なら第 2 キー」。**全要素**が並びを決める。
      for (const element of node.elements) resolve(element, at, seen);
      return;
    }

    if (isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (isShorthandPropertyAssignment(property)) {
          // `{ order }` は列名が `order`。値（向き）は並ぶ列に関係しない。
          uses.push({ file, field: property.name.text });
          continue;
        }
        if (!isPropertyAssignment(property)) {
          unresolved.push({
            file,
            line: lineOf(property),
            reason: "spread で並び順のキーが読めない",
          });
          continue;
        }
        if (isComputedPropertyName(property.name)) {
          unresolved.push({
            file,
            line: lineOf(property),
            reason:
              "計算されたキー（`{ [sortBy]: … }`）。どの列で並ぶかが静的に決まらない — " +
              "取りうる列ごとにリテラルで分岐させる",
          });
          continue;
        }
        const key =
          isIdentifier(property.name) || isStringLiteralLike(property.name)
            ? property.name.text
            : null;
        if (key === null) {
          unresolved.push({
            file,
            line: lineOf(property),
            reason: "キーが読めない",
          });
          continue;
        }
        const value = unwrap(property.initializer);
        if (isObjectLiteralExpression(value) && !isSortOrderInput(value)) {
          // リレーション経由（`{ space: { name: "asc" } }`）。並ぶ列は内側。
          resolve(value, at, seen);
          continue;
        }
        uses.push({ file, field: key });
      }
      return;
    }

    if (isConditionalExpression(node)) {
      resolve(node.whenTrue, at, seen);
      resolve(node.whenFalse, at, seen);
      return;
    }

    if (isIdentifier(node)) {
      const target = values.get(node.text);
      if (target !== undefined) {
        resolve(target, at, seen);
        return;
      }
      unresolved.push({
        file,
        line: lineOf(at),
        reason: `${node.text} を同じファイル内で辿れない（import された値は読めない）`,
      });
      return;
    }

    if (isCallExpression(node) && isIdentifier(node.expression)) {
      const fn = functions.get(node.expression.text);
      if (fn !== undefined) {
        for (const returned of returnedExpressions(fn))
          resolve(returned, at, seen);
        return;
      }
    }

    unresolved.push({
      file,
      line: lineOf(at),
      reason: `${SyntaxKind[node.kind]} は並び順のキーまで辿れない`,
    });
  };

  const visit = (node: Node): void => {
    if (isPropertyAssignment(node)) {
      const name =
        isIdentifier(node.name) || isStringLiteralLike(node.name)
          ? node.name.text
          : null;
      if (name === "orderBy") resolve(node.initializer, node, new Set());
    }
    forEachChild(node, visit);
  };
  visit(sourceFile);

  return { uses, unresolved };
}

function scanSource(): {
  uses: OrderByUse[];
  unresolved: UnresolvedOrderBy[];
} {
  const files = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString("utf8")
    .split(String.fromCharCode(0))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const uses: OrderByUse[] = [];
  const unresolved: UnresolvedOrderBy[] = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    if (!source.includes("orderBy")) continue;
    const found = readOrderBy(file, source);
    uses.push(...found.uses);
    unresolved.push(...found.unresolved);
  }
  return { uses, unresolved };
}

const SCAN = scanSource();
const UNRESOLVED = SCAN.unresolved;
const USES = SCAN.uses.filter((use) => ENUM_FIELDS.has(use.field));

/**
 * enum 列で並べ替えている箇所と、**そこが依存している値の前後関係**。
 *
 * `before` が `after` より先に宣言されていることを検査する。`asc` / `desc` の
 * どちらで使うかは呼び出し側の都合なので、ここでは「宣言順がこうである」だけを固定する。
 */
const ORDER_DEPENDENCIES: readonly {
  readonly file: string;
  readonly field: string;
  readonly enumName: string;
  readonly before: string;
  readonly after: string;
  readonly why: string;
}[] = [
  {
    file: "src/shared/domain/reservations/availability.ts",
    field: "scope",
    enumName: "BlockedDateScope",
    before: "GLOBAL",
    after: "LOCATION",
    why: '`orderBy: { scope: "asc" }` で最優先の休業理由を採る。逆転すると全社休業日よりスペース単位の理由が表示される',
  },
  {
    file: "src/shared/domain/reservations/availability.ts",
    field: "scope",
    enumName: "BlockedDateScope",
    before: "LOCATION",
    after: "SPACE",
    why: "同上（3 階層 cascade の 2 段目と 3 段目）",
  },
  {
    file: "src/shared/domain/events/waitlist-queries.ts",
    field: "status",
    enumName: "RegistrationStatus",
    before: "WAITLISTED",
    after: "WAITLISTED_OFFERED",
    why: '`orderBy: [{ status: "desc" }]` でオファー済みを先頭に出す。逆転するとオファー済みが待機中より下に沈み、管理者が見落として 24 時間の期限が切れる',
  },
  // スタッフ一覧の「権限」列で並べ替えると、`Role` の宣言順がそのまま表示順になる。
  // 宣言順は権限の強い順（SUPER_ADMIN → … → VIEWER）で、その後ろに非管理者
  // （USER / CUSTOMER）が来る。並べ替えても権限の階層が読めることが要件なので、
  // アルファベット順などに並べ替え直すと列の意味が失われる。
  {
    file: "src/shared/domain/users/queries.ts",
    field: "role",
    enumName: "Role",
    before: "SUPER_ADMIN",
    after: "ADMIN",
    why: "スタッフ一覧を権限順に並べる。権限の強い順が崩れると、昇順の先頭が最上位権限でなくなる",
  },
  {
    file: "src/shared/domain/users/queries.ts",
    field: "role",
    enumName: "Role",
    before: "ADMIN",
    after: "EDITOR",
    why: "同上（権限の階層 2 段目と 3 段目）",
  },
  {
    file: "src/shared/domain/users/queries.ts",
    field: "role",
    enumName: "Role",
    before: "EDITOR",
    after: "VIEWER",
    why: "同上（権限の階層 3 段目と 4 段目）",
  },
  {
    file: "src/shared/domain/users/queries.ts",
    field: "role",
    enumName: "Role",
    before: "VIEWER",
    after: "USER",
    why: "管理者ロールが先、非管理者（USER / CUSTOMER）が後ろ。混ざるとスタッフ一覧で管理者を追えなくなる",
  },
];

function declaredIndex(enumName: string, value: string): number {
  return ENUMS.get(enumName)?.indexOf(value) ?? -1;
}

describe("enum 列での並べ替えは宣言順に依存する", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // どれかが 0 になると以降が全部 vacuous に通る。
    expect(ENUMS.size).toBeGreaterThan(30);
    expect(ENUM_FIELDS.size).toBeGreaterThan(20);
    expect(USES.length).toBeGreaterThan(0);
    // 値の読み取りが機能していること（コメント行を値と取り違えていない）。
    expect(ENUMS.get("BlockedDateScope")).toEqual([
      "GLOBAL",
      "LOCATION",
      "SPACE",
    ]);
    // AST が定数と配列の 2 要素目を辿れていること（正規表現版はどちらも取り落とした）。
    const adminSearch = SCAN.uses.filter(
      (use) => use.file === "src/shared/domain/admin-search/queries.ts",
    );
    expect(adminSearch.map((use) => use.field)).toContain("id");
  });

  test("並び順のキーを読み切れない orderBy が無い", () => {
    // 読めなかったものを安全側に倒すと、`orderBy: { [sortBy]: … }` が黙って
    // 素通りする。実際にそうなっていて、`User.role`（enum）での並べ替えを
    // 丸ごと見落としていた（Codex 指摘、PR #1955）。
    expect(
      UNRESOLVED.map(
        (entry) => `${entry.file}:${entry.line} — ${entry.reason}`,
      ),
    ).toEqual([]);
  });

  test("enum 列で並べ替えている箇所がすべて宣言されている", () => {
    const declared = new Set(
      ORDER_DEPENDENCIES.map((d) => `${d.file}::${d.field}`),
    );
    const undeclared = [...new Set(USES.map((u) => `${u.file}::${u.field}`))]
      .filter((k) => !declared.has(k))
      .map(
        (k) =>
          `${k}: enum 列で並べ替えている。PostgreSQL は宣言順でソートするので、` +
          `依存している値の前後関係を ORDER_DEPENDENCIES に宣言する`,
      );

    expect(undeclared).toEqual([]);
  });

  test("宣言した前後関係が schema.prisma の宣言順と一致する", () => {
    const violations = ORDER_DEPENDENCIES.flatMap((d) => {
      const beforeAt = declaredIndex(d.enumName, d.before);
      const afterAt = declaredIndex(d.enumName, d.after);
      if (beforeAt === -1 || afterAt === -1) {
        return [
          `${d.enumName}: ${d.before} / ${d.after} のどちらかが宣言に無い（改名・削除された）`,
        ];
      }
      return beforeAt < afterAt
        ? []
        : [
            `${d.enumName}: ${d.before} が ${d.after} より後ろに宣言されている。${d.why}`,
          ];
    });

    expect(violations).toEqual([]);
  });

  test("宣言が実在する箇所を指している", () => {
    const actual = new Set(USES.map((u) => `${u.file}::${u.field}`));
    const stale = ORDER_DEPENDENCIES.map((d) => `${d.file}::${d.field}`)
      .filter((k) => !actual.has(k))
      .map((k) => `${k}: もう enum 列で並べ替えていない。宣言を外すこと`);

    expect([...new Set(stale)]).toEqual([]);
  });
});
