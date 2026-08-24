/**
 * 「このソースは指定した hook を呼んでいるか」を **AST** で判定する。
 *
 * ## なぜ正規表現をやめたか（監査 A-97）
 *
 * フォーム系の 2 gate は `useActionState\(` / `source.includes("useForm(")` で
 * 母集合を絞っていた。**型引数を付けた呼び出し（`useActionState<...>(` /
 * `useForm<z.input<typeof schema>>({`）はどちらにも一致しない**ため、実在する
 * 25 ファイルが黙って検査対象から外れていた。
 *
 * 同じ形は別の gate でも踏んでいる（`public-mutation-guard-order` の
 * `runGuestTokenMutation<T>({`）。`.claude/rules/architecture-gates.md` の
 * 「正規表現を 2 回広げたら AST へ移す」に従い、識別子の呼び出し検出は
 * ここへ集約する。**2 つの gate が別々の検出器を持つと必ず片方だけが古びる。**
 *
 * ## 何を見るか
 *
 * `CallExpression` の callee が指定名の `Identifier` であること。
 * 型引数の有無・改行・空白には影響されない。
 *
 * ## 見ないもの
 *
 * **別名 import（`useForm as X`）は追わない。** 呼び出し側の識別子が変わるので
 * ここでは 0 件になる。呼び出し元の gate が「別名を付けたら明示的に落とす」形で
 * 扱うこと（`conform-form-pattern.test.ts` の `ALIASED_HOOK_IMPORT` がその実装）。
 */

import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isCallExpression,
  isIdentifier,
  type Node,
} from "typescript";

/**
 * `source` が `hookNames` のいずれかを呼び出しているか。
 *
 * @param filePath 拡張子から TS / TSX を選ぶためだけに使う（実ファイルでなくてよい）
 */
export function callsAnyHook(
  source: string,
  filePath: string,
  hookNames: ReadonlySet<string>,
): boolean {
  const parsed = createSourceFile(
    filePath,
    source,
    ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );

  let found = false;
  const visit = (node: Node): void => {
    if (found) return;
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      hookNames.has(node.expression.text)
    ) {
      found = true;
      return;
    }
    forEachChild(node, visit);
  };
  forEachChild(parsed, visit);
  return found;
}
