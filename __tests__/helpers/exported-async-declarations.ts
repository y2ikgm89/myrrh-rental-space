/**
 * 「このモジュールが export している async 関数」を **AST** で列挙する。
 *
 * ## なぜ共有するのか
 *
 * Server Action を走査する gate は 2 本ある。片方
 * （`assert-customer-active-server-actions`）は宣言形とアロー形の両方を見て
 * いたのに、もう片方（`public-mutation-guard-order`）は
 * `/^export async function (\w+)/` の正規表現しか持たず、
 * **`export const foo = async () => {}` を 1 件も見ていなかった**。
 *
 * その gate は docstring で「`"use server"` を含む module の exported async
 * function を**全件**登録させる」と宣言している。宣言が実装より広いので、
 * アロー形で書いた公開 mutation は SSoT への登録を求められず、
 * Turnstile も rate limit も無いまま素通りできた。
 *
 * `.claude/rules/architecture-gates.md` の「識別子の検出は AST へ集約する。
 * 2 つの gate が別々の検出器を持つと必ず片方だけが古びる」に従って、
 * ここへ寄せる。
 *
 * ## 何を返すか
 *
 * - `export async function foo() {}`
 * - `export const foo = async () => {}`
 * - `export const foo = async function () {}`
 *
 * `name` は識別子、`body` は本体ノード（呼び出し検出用）、`node` は宣言全体
 * （ソース片を切り出す用）。
 *
 * ## 見ないもの
 *
 * `export default` と re-export（`export { foo } from "./x"`）は対象外。
 * Server Action は名前付き export で書く規約で、`use-server-exports` gate が
 * それを別途強制している。
 */

import {
  SyntaxKind,
  canHaveModifiers,
  forEachChild,
  getModifiers,
  isArrowFunction,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isVariableStatement,
  type Node,
  type SourceFile,
} from "typescript";

export type ExportedAsyncDeclaration = {
  /** 識別子名。 */
  readonly name: string;
  /** 本体ノード（`containsCallTo` などの呼び出し検出に使う）。 */
  readonly body: Node;
  /** 宣言全体のノード（`getText()` でソース片を取る用）。 */
  readonly node: Node;
};

/** node が与えた修飾を持つか（cast なしで modifiers を読む）。 */
export function hasModifier(node: Node, kind: SyntaxKind): boolean {
  if (!canHaveModifiers(node)) return false;
  return (getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
}

/** モジュール直下の `export async` 宣言を、関数形とアロー形の両方で集める。 */
export function exportedAsyncDeclarations(
  source: SourceFile,
): ExportedAsyncDeclaration[] {
  const out: ExportedAsyncDeclaration[] = [];

  forEachChild(source, (node) => {
    if (
      isFunctionDeclaration(node) &&
      node.body !== undefined &&
      node.name !== undefined &&
      hasModifier(node, SyntaxKind.ExportKeyword) &&
      hasModifier(node, SyntaxKind.AsyncKeyword)
    ) {
      out.push({ name: node.name.text, body: node.body, node });
      return;
    }

    if (!isVariableStatement(node)) return;
    if (!hasModifier(node, SyntaxKind.ExportKeyword)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!isIdentifier(declaration.name)) continue;
      const initializer = declaration.initializer;
      if (initializer === undefined) continue;
      if (!isArrowFunction(initializer) && !isFunctionExpression(initializer)) {
        continue;
      }
      if (!hasModifier(initializer, SyntaxKind.AsyncKeyword)) continue;
      out.push({
        name: declaration.name.text,
        body: initializer.body,
        node: declaration,
      });
    }
  });

  return out;
}
