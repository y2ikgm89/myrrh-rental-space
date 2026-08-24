/**
 * **kill switch の判定を、寿命の長い `'use cache'` の中で読まない。**
 *
 * ## なぜ
 *
 * `getFeatureModulesSettings` は kill switch なので `CACHE_LIFE.FEATURE_FLAGS`
 * （minutes）に落としてある。`cache.ts` の docstring は「管理画面で OFF に
 * してから公開面に効くまでの上限は約 1 分」と**数字で宣言している**。
 *
 * ところがその関数を `PUBLIC_CONTENT`（hours）や `STATIC_SETTINGS`（days）の
 * `'use cache'` の中から呼ぶと、**外側のキャッシュが内側の短い寿命を包んでしまう**。
 * 内側が何分で切れても、外側が返すのは最初に焼き込まれた値。
 * 宣言した 1 分の上限が、その経路だけ成立しなくなる。
 *
 * 実際に 4 件あった（監査 F-65 と同じ形）:
 *
 * - `getPublicNavigation`（STATIC_SETTINGS = days）— 機能を OFF にしても
 *   ナビに 404 になるリンクが days のあいだ並び続けた
 * - `getPublishedReviewsForSpace` / `getSpaceReviewStats` /
 *   `getSpaceReviewStatsMultiple`（PUBLIC_CONTENT = hours）— reviews を OFF に
 *   してもレビューが hours のあいだ出続けた
 *
 * どれも「読み取り自体は正しい関数を呼んでいる」ので、呼び出し先を見るだけでは
 * 気づけない。**どのキャッシュの内側にいるか**が欠陥の本体。
 *
 * ## 何を見るか
 *
 * TypeScript の AST で、本体先頭に `'use cache'` ディレクティブを持つ関数を集め、
 * その部分木の中に feature module を読む呼び出しがあるかを見る。
 *
 * - 部分木にはコールバック（`safeFetch({ fetch: () => … })` など）も含める。
 *   そこでの呼び出しもキャッシュの内側で実行されるため。
 * - **同一ファイル内のラッパーも追う。** `isReviewsEnabledGlobally()` のような
 *   1 行の局所ラッパーを挟むだけで検査を抜けられては意味がない。
 *   「reader を呼ぶ局所関数もまた reader」を不動点まで畳む。
 *
 * ## 粗いところ（承知のうえ）
 *
 * ファイルをまたぐラッパーは追わない。別ファイルに `export const isX = () =>
 * isFeatureEnabled("x")` を作って呼べば素通りする。そこまで解決するには
 * モジュールグラフ全体の型解決が要り、この gate が防ぎたい欠陥
 * （キャッシュの入れ子）には釣り合わない。
 *
 * ## 直し方
 *
 * feature 判定を `'use cache'` の**外**へ出す。DB 読み取りは長い寿命のまま
 * 内側に残し、外側の薄いラッパーで判定して早期 return する。
 * 短命プロファイルへ倒す案は取らない — 変わらないものまで毎分読み直すことになる。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isArrowFunction,
  isBlock,
  isCallExpression,
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodDeclaration,
  isStringLiteral,
  type FunctionLikeDeclaration,
  type Node,
  type SourceFile,
} from "typescript";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();

/**
 * feature module を読む入口。ここが SSoT。
 *
 * 名前を変えたら下の「実在確認」テストが落ちるので、静かに空振りにはならない。
 */
const FEATURE_READERS = [
  "isFeatureEnabled",
  "getEnabledFeatures",
  "getFeatureFilterContext",
  "getFeatureModulesSettings",
] as const;

type CachedFunction = {
  readonly file: string;
  readonly name: string;
  readonly node: FunctionLikeDeclaration;
};

function isFunctionLike(node: Node): node is FunctionLikeDeclaration {
  return (
    isFunctionDeclaration(node) ||
    isFunctionExpression(node) ||
    isArrowFunction(node) ||
    isMethodDeclaration(node)
  );
}

/** 本体先頭の `'use cache'` ディレクティブを持つか。 */
function hasUseCacheDirective(node: FunctionLikeDeclaration): boolean {
  const body = node.body;
  if (body === undefined || !isBlock(body)) return false;
  for (const statement of body.statements) {
    if (!isExpressionStatement(statement)) break;
    const expression = statement.expression;
    if (!isStringLiteral(expression)) break;
    if (expression.text === "use cache") return true;
  }
  return false;
}

function functionName(node: FunctionLikeDeclaration): string {
  const name = node.name;
  if (name !== undefined && isIdentifier(name)) return name.text;
  const parent = node.parent as Node | undefined;
  if (parent !== undefined && "name" in parent) {
    const parentName = (parent as { name?: Node }).name;
    if (parentName !== undefined && isIdentifier(parentName)) {
      return parentName.text;
    }
  }
  return "(anonymous)";
}

function parse(file: string, source: string): SourceFile {
  return createSourceFile(
    file,
    source,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );
}

/** 部分木に含まれる呼び出し先の識別子名を全て集める。 */
function calledIdentifiers(root: Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: Node): void => {
    if (isCallExpression(node) && isIdentifier(node.expression)) {
      names.add(node.expression.text);
    }
    forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/**
 * そのファイルで「feature module を読む」ことになる名前の集合。
 *
 * 既知の reader に加えて、reader を呼ぶ**同一ファイル内の関数**も reader に
 * 畳み込む（不動点）。局所ラッパー 1 枚で検査を抜けられないようにする。
 */
function resolveReaderNames(sourceFile: SourceFile): Set<string> {
  const readers = new Set<string>(FEATURE_READERS);
  const localFunctions: Array<{ name: string; node: FunctionLikeDeclaration }> =
    [];
  const collect = (node: Node): void => {
    if (isFunctionLike(node)) {
      const name = functionName(node);
      if (name !== "(anonymous)") localFunctions.push({ name, node });
    }
    forEachChild(node, collect);
  };
  collect(sourceFile);

  for (let pass = 0; pass < localFunctions.length + 1; pass++) {
    let grew = false;
    for (const { name, node } of localFunctions) {
      if (readers.has(name)) continue;
      for (const called of calledIdentifiers(node)) {
        if (readers.has(called)) {
          readers.add(name);
          grew = true;
          break;
        }
      }
    }
    if (!grew) break;
  }
  return readers;
}

function collectCachedFunctions(
  file: string,
  sourceFile: SourceFile,
): CachedFunction[] {
  const out: CachedFunction[] = [];
  const visit = (node: Node): void => {
    if (isFunctionLike(node) && hasUseCacheDirective(node)) {
      out.push({ file, name: functionName(node), node });
    }
    forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

/** `'use cache'` の内側から feature module を読んでいる箇所を列挙する。 */
export function findFeatureReadsInsideCache(
  file: string,
  source: string,
): string[] {
  const sourceFile = parse(file, source);
  const readers = resolveReaderNames(sourceFile);
  const offenders: string[] = [];
  for (const cached of collectCachedFunctions(file, sourceFile)) {
    for (const called of calledIdentifiers(cached.node)) {
      if (readers.has(called)) {
        offenders.push(`${cached.file}: ${cached.name} → ${called}`);
      }
    }
  }
  return offenders;
}

const sourceFiles = trackedTextFiles(ROOT).filter(
  (file) =>
    file.startsWith("src/") && (file.endsWith(".ts") || file.endsWith(".tsx")),
);

const cachedFunctionCount = sourceFiles.reduce((total, file) => {
  const source = readFileSync(join(ROOT, file), "utf8");
  if (!source.includes("use cache")) return total;
  return total + collectCachedFunctions(file, parse(file, source)).length;
}, 0);

describe("'use cache' は kill switch の寿命を包まない", () => {
  test("走査が空振りしていない（cached 関数を実際に見つけている）", () => {
    expect(sourceFiles.length).toBeGreaterThan(1000);
    expect(cachedFunctionCount).toBeGreaterThan(40);
  });

  test("FEATURE_READERS の名前が実在する", () => {
    const check = readFileSync(
      join(ROOT, "src/shared/domain/features/check.ts"),
      "utf8",
    );
    const settings = readFileSync(
      join(ROOT, "src/shared/domain/settings/queries/features.ts"),
      "utf8",
    );
    const declared = `${check}\n${settings}`;
    expect(
      FEATURE_READERS.filter(
        (name) => !declared.includes(`export async function ${name}`),
      ),
    ).toEqual([]);
  });

  test("落ちるべき形: cached 関数が直接 feature module を読む", () => {
    const source = [
      `import { isFeatureEnabled } from "@/shared/domain/features/check";`,
      `export async function getThings() {`,
      `  "use cache";`,
      `  if (!(await isFeatureEnabled("reviews"))) return [];`,
      `  return [];`,
      `}`,
    ].join("\n");
    expect(findFeatureReadsInsideCache("src/fixture.ts", source)).toEqual([
      "src/fixture.ts: getThings → isFeatureEnabled",
    ]);
  });

  test("落ちるべき形: 局所ラッパーを 1 枚挟んでも検出する", () => {
    const source = [
      `import { isFeatureEnabled } from "@/shared/domain/features/check";`,
      `async function isReviewsOn() {`,
      `  return isFeatureEnabled("reviews");`,
      `}`,
      `export async function getThings() {`,
      `  "use cache";`,
      `  if (!(await isReviewsOn())) return [];`,
      `  return [];`,
      `}`,
    ].join("\n");
    expect(findFeatureReadsInsideCache("src/fixture.ts", source)).toEqual([
      "src/fixture.ts: getThings → isReviewsOn",
    ]);
  });

  test("落ちるべき形: コールバックの中でもキャッシュの内側", () => {
    const source = [
      `import { isFeatureEnabled } from "@/shared/domain/features/check";`,
      `export async function getThings() {`,
      `  "use cache";`,
      `  return safeFetch({ fetch: async () => (await isFeatureEnabled("x")) ? 1 : 0 });`,
      `}`,
    ].join("\n");
    expect(findFeatureReadsInsideCache("src/fixture.ts", source)).toHaveLength(
      1,
    );
  });

  test("落ちてはいけない形: 判定を cached 関数の外に出してある", () => {
    const source = [
      `import { isFeatureEnabled } from "@/shared/domain/features/check";`,
      `async function getThingsCached() {`,
      `  "use cache";`,
      `  return [];`,
      `}`,
      `export async function getThings() {`,
      `  if (!(await isFeatureEnabled("reviews"))) return [];`,
      `  return getThingsCached();`,
      `}`,
    ].join("\n");
    expect(findFeatureReadsInsideCache("src/fixture.ts", source)).toEqual([]);
  });

  test("落ちてはいけない形: reader 自身は cached でよい（FEATURE_FLAGS profile）", () => {
    const source = [
      `export async function getFeatureModulesSettings() {`,
      `  "use cache";`,
      `  cacheLife(CACHE_LIFE.FEATURE_FLAGS);`,
      `  return {};`,
      `}`,
    ].join("\n");
    expect(findFeatureReadsInsideCache("src/fixture.ts", source)).toEqual([]);
  });

  test("src 配下に違反が無い", () => {
    const offenders = sourceFiles.flatMap((file) => {
      const source = readFileSync(join(ROOT, file), "utf8");
      if (!source.includes("use cache")) return [];
      return findFeatureReadsInsideCache(file, source);
    });
    expect(offenders).toEqual([]);
  });
});
