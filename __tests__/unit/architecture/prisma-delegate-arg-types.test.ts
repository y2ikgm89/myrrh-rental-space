/**
 * 手書きの最小構造型で Prisma のデリゲートを受けるとき、**引数を必ず Prisma 公式の
 * Input 型で受ける**ことの gate。
 *
 * ## なぜ要るのか
 *
 * この repo は呼び出し側を `Prisma.TransactionClient` に縛らないため、
 * 「実際に使うメソッドだけを宣言した最小構造型」を手書きする流儀を採っている
 * （`src/shared/lib/reservation/types.ts` の `PrismaTransactionClient` が手本で、
 * そのコメントも「where / orderBy は Prisma 公式の Input 型を使用して field 名
 * typo / type drift を build 時検出する」と書いている）。
 *
 * ところが引数を `args: object` と書くと、その宣言は **Prisma の型検査を丸ごと
 * 無効化する**。存在しない列を `where` に書いてもコンパイルは通り、実行時に
 * `PrismaClientValidationError` になる。`any` は grep gate が 0 件強制しているのに、
 * `object` は同じ穴を開けながら誰も見ていなかった。
 *
 * 実際に本番相当の経路が 1 つ壊れていた: `blocked-dates/locks.ts` が
 * `space.findMany({ where: { deletedAt: null } })` を投げていたが、`Space` に
 * `deletedAt` は無い（soft delete を持たず `isActive` / `isPublished` しかない）。
 * 結果、**GLOBAL / LOCATION スコープの休業日の作成・更新・削除が全て 500** で、
 * 管理者は全社休業日も拠点休業日も設定できなかった。型検査も lint も緑のままで、
 * `args: object` が 7 ファイル 17 箇所にあった。
 *
 * ## 母集合
 *
 * 免除リストは置かない。schema.prisma のモデル名から Prisma のデリゲート名
 * （先頭小文字）を導出し、その名前のプロパティを持つ型リテラルの中にある
 * メソッド宣言を全部見る。**新しい最小構造型を書くと、Prisma の Input 型で
 * 受けるまで赤くなる。**
 *
 * ## 判定
 *
 * 型リテラル引数では `where` / `data` / `orderBy` / `select` / `include` /
 * `cursor` の**それぞれ**に `Prisma.` 修飾の型参照を要求する。引数のどこか 1
 * 箇所に `Prisma.` があれば通すと、手書き where が `select: Prisma.XSelect` と
 * 同居しても素通りする。型リテラルでない引数（`object` / `unknown` /
 * `Prisma.XFindManyArgs` 等）は引数全体を見る。全パラメータが条件を満たすこと
 * （`params.every`）。どれか 1 つでも Prisma 型なら通すと、
 * `findMany(args: object, opts: Prisma.SpaceSelect)` が緑になる。
 *
 * 同一ファイル内の type alias は 1 段だけ辿る。**辿れなければ通さない**
 * （「読めなかった＝安全」にすると、alias を挟むだけで素通りするため）。
 *
 * ## この gate が証明すること / しないこと
 *
 * **証明する**: 手書き構造型のデリゲート引数がすべて Prisma の Input 型を
 * 経由しており、列名の drift が `bun run type-check` で出ること。
 *
 * **証明しない**: 渡している `where` が業務的に正しいこと。`deletedAt` を
 * `isActive` に直したときに意味が合っているかは
 * `__tests__/integration/domain/blocked-dates/scope-write-locks.test.ts`
 * のように実 DB を通す検査の担当。
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isFunctionTypeNode,
  isIdentifier,
  isMethodSignature,
  isPropertySignature,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeReferenceNode,
  type Node,
  type ParameterDeclaration,
  type SourceFile,
  type TypeElement,
  type TypeNode,
} from "typescript";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Prisma が client に生やすデリゲート名（モデル名の先頭を小文字にしたもの）。 */
function delegateNames(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const match of readPrismaSchema().matchAll(/^model\s+(\w+)\s*\{/gmu)) {
    const model = match[1];
    if (!model) continue;
    out.add(`${model[0]?.toLowerCase() ?? ""}${model.slice(1)}`);
  }
  return out;
}

const DELEGATES = delegateNames();

/** 引数の形が列名に依存する読み書きメソッド。 */
const GUARDED_METHODS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

interface Violation {
  readonly file: string;
  readonly delegate: string;
  readonly method: string;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  for (const entry of glob.scanSync({ cwd: dir, absolute: true })) {
    out.push(entry);
  }
  return out;
}

/** 同一ファイル内の `type X = ...` を 1 段だけ引く。 */
function typeAliases(source: SourceFile): Map<string, TypeNode> {
  const out = new Map<string, TypeNode>();
  forEachChild(source, (node) => {
    if (isTypeAliasDeclaration(node)) out.set(node.name.text, node.type);
  });
  return out;
}

/** その型のどこかに `Prisma.` 修飾の型参照が現れるか。 */
function referencesPrismaInput(type: TypeNode | undefined): boolean {
  if (!type) return false;
  let found = false;
  const walk = (node: Node): void => {
    if (found) return;
    if (isTypeReferenceNode(node) && !isIdentifier(node.typeName)) {
      // QualifiedName（`Prisma.XxxWhereInput`）の左端が `Prisma` か。
      let left = node.typeName.left;
      while (!isIdentifier(left)) left = left.left;
      if (left.text === "Prisma") {
        found = true;
        return;
      }
    }
    forEachChild(node, walk);
  };
  walk(type);
  return found;
}

/** 型リテラル / interface の本体を取り出す（alias は 1 段だけ辿る）。 */
function memberContainer(
  type: TypeNode | undefined,
  aliases: ReadonlyMap<string, TypeNode>,
): TypeNode | undefined {
  if (!type) return undefined;
  if (isTypeLiteralNode(type)) return type;
  if (isTypeReferenceNode(type) && isIdentifier(type.typeName)) {
    const resolved = aliases.get(type.typeName.text);
    if (resolved && isTypeLiteralNode(resolved)) return resolved;
  }
  return undefined;
}

/** メソッド宣言・関数型プロパティの両方から引数リストを取る。 */
function methodParameters(
  member: TypeElement,
): readonly ParameterDeclaration[] | undefined {
  if (isMethodSignature(member)) return member.parameters;
  if (
    isPropertySignature(member) &&
    member.type &&
    isFunctionTypeNode(member.type)
  ) {
    return member.type.parameters;
  }
  return undefined;
}

/** Prisma が列名検査する引数プロパティ。ここだけ手書きを許すと drift が残る。 */
const PRISMA_ARG_PROPERTIES = new Set([
  "where",
  "data",
  "orderBy",
  "select",
  "include",
  "cursor",
]);

/** 同一ファイル内 alias を 1 段だけ引く。辿れなければ宣言そのものを返す。 */
function resolveAlias(
  type: TypeNode | undefined,
  aliases: ReadonlyMap<string, TypeNode>,
): TypeNode | undefined {
  if (!type) return undefined;
  if (isTypeReferenceNode(type) && isIdentifier(type.typeName)) {
    return aliases.get(type.typeName.text) ?? type;
  }
  return type;
}

/** 型リテラルなら Prisma 意味のあるプロパティ単位。それ以外は引数全体。 */
function argumentUsesPrismaInput(
  type: TypeNode | undefined,
  aliases: ReadonlyMap<string, TypeNode>,
): boolean {
  const resolved = resolveAlias(type, aliases);
  if (!resolved) return false;
  if (isTypeLiteralNode(resolved)) {
    const prismaProps: Array<TypeNode | undefined> = [];
    for (const member of resolved.members) {
      if (
        !isPropertySignature(member) ||
        !member.name ||
        !isIdentifier(member.name)
      ) {
        continue;
      }
      if (PRISMA_ARG_PROPERTIES.has(member.name.text)) {
        prismaProps.push(member.type);
      }
    }
    if (prismaProps.length > 0) {
      return prismaProps.every((propType) =>
        referencesPrismaInput(resolveAlias(propType, aliases)),
      );
    }
  }
  return referencesPrismaInput(resolved);
}

/** 全引数が Prisma の Input 型を経由していれば合格。 */
function parametersUsePrismaInput(
  params: readonly ParameterDeclaration[],
  aliases: ReadonlyMap<string, TypeNode>,
): boolean {
  return params.every((param) => argumentUsesPrismaInput(param.type, aliases));
}

/** fixture 用の疑似ファイル内容（`analyzeSnippet` だけが書き込む）。 */
const FIXTURE = new Map<string, string>();

function collect(file: string): Violation[] {
  const text = FIXTURE.get(file) ?? readFileSync(file, "utf8");
  const source = createSourceFile(
    file,
    text,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );
  const aliases = typeAliases(source);
  const out: Violation[] = [];

  const inspectDelegateBody = (delegate: string, body: TypeNode): void => {
    if (!isTypeLiteralNode(body)) return;
    for (const member of body.members) {
      const name =
        member.name && isIdentifier(member.name) ? member.name.text : null;
      if (!name || !GUARDED_METHODS.has(name)) continue;

      const params = methodParameters(member);
      if (!params || params.length === 0) continue;

      if (!parametersUsePrismaInput(params, aliases)) {
        out.push({
          file: relative(ROOT, file).replaceAll("\\", "/"),
          delegate,
          method: name,
        });
      }
    }
  };

  const walk = (node: Node): void => {
    if (isPropertySignature(node) && node.name && isIdentifier(node.name)) {
      const delegate = node.name.text;
      if (DELEGATES.has(delegate)) {
        const body = memberContainer(node.type, aliases);
        if (body) inspectDelegateBody(delegate, body);
      }
    }
    forEachChild(node, walk);
  };
  forEachChild(source, walk);
  return out;
}

/**
 * fixture を **本番と同じ解析器**へ通す。
 *
 * gate 自身が「通してはいけないものを本当に落とすか」を毎回証明するために要る。
 * 別実装で確かめると、gate が壊れても fixture だけ緑になる。
 */
function analyzeSnippet(code: string): Violation[] {
  const path = join(ROOT, "__gate_fixture__.ts");
  const original = FIXTURE.get(path);
  FIXTURE.set(path, code);
  try {
    return collect(path).map((v) => ({ ...v, file: "fixture.ts" }));
  } finally {
    if (original === undefined) FIXTURE.delete(path);
    else FIXTURE.set(path, original);
  }
}

describe("手書き構造型の Prisma 引数は公式 Input 型で受ける", () => {
  test("走査対象と母集合が空でない（gate 自体が空振りしていない）", () => {
    expect(DELEGATES.size).toBeGreaterThan(50);
    expect(DELEGATES.has("space")).toBe(true);
    expect(DELEGATES.has("blockedDate")).toBe(true);
    expect(sourceFiles(SRC).length).toBeGreaterThan(500);
  });

  test("通ってはいけない書き方が実際に落ちる（fixture）", () => {
    // `object` — 実際に本番バグを生んだ形。
    expect(
      analyzeSnippet(
        `interface T { readonly space: { findMany(args: object): Promise<{ id: string }[]> } }`,
      ),
    ).toHaveLength(1);
    // `unknown` / `any` / `Record` も同じ穴。
    expect(
      analyzeSnippet(
        `interface T { readonly space: { findMany(args: unknown): Promise<void> } }`,
      ),
    ).toHaveLength(1);
    expect(
      analyzeSnippet(
        `interface T { readonly space: { create(args: Record<string, unknown>): Promise<void> } }`,
      ),
    ).toHaveLength(1);
    // 手書きの where の形も落とす（列名 drift を検出できないため）。
    expect(
      analyzeSnippet(
        `interface T { readonly space: { findMany(args: { where: { deletedAt: null } }): Promise<void> } }`,
      ),
    ).toHaveLength(1);
    // alias で包んでも素通りしない。
    expect(
      analyzeSnippet(
        `type A = object; interface T { readonly space: { findMany(args: A): Promise<void> } }`,
      ),
    ).toHaveLength(1);
    // 手書き where と Prisma select の同居（tsc が通す混在形）。
    expect(
      analyzeSnippet(
        `interface T { readonly space: { findMany(args: { where: { id: string; deletedAt: null }; select: Prisma.SpaceSelect }): Promise<void> } }`,
      ),
    ).toHaveLength(1);
    // 第 2 引数の Prisma 型で第 1 引数の `object` を洗浄できない。
    expect(
      analyzeSnippet(
        `interface T { readonly space: { findMany(args: object, opts: Prisma.SpaceSelect): Promise<void> } }`,
      ),
    ).toHaveLength(1);
  });

  test("通ってよい書き方は落ちない（fixture）", () => {
    expect(
      analyzeSnippet(
        `interface T { readonly space: { findMany(args: { where: Prisma.SpaceWhereInput }): Promise<void> } }`,
      ),
    ).toEqual([]);
    expect(
      analyzeSnippet(
        `type A = { where: Prisma.SpaceWhereInput }; interface T { readonly space: { findMany(args: A): Promise<void> } }`,
      ),
    ).toEqual([]);
    // デリゲート名でないプロパティは対象外。
    expect(
      analyzeSnippet(
        `interface T { readonly cache: { findMany(args: object): Promise<void> } }`,
      ),
    ).toEqual([]);
  });

  // src 全ファイルの AST 走査。CI の per-file 並列負荷下で 5s default を超えうるため 30s。
  test("src に Prisma 型検査を無効化する引数宣言が無い", () => {
    const offenders = sourceFiles(SRC).flatMap((file) => collect(file));

    expect({
      offenders: offenders.map((o) => `${o.file} :: ${o.delegate}.${o.method}`),
      hint:
        offenders.length > 0
          ? "手書きの最小構造型でも引数は Prisma.<Model>WhereInput / <Model>UncheckedUpdateManyInput 等で受ける。`object` にすると存在しない列を where に書いてもコンパイルが通り、実行時に PrismaClientValidationError で 500 になる"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  }, 30_000);
});
