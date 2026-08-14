import {
  $isElementNode,
  type LexicalNode,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from "lexical";

/**
 * ノードを**子孫まで含めて** JSON 化する。
 *
 * ## なぜ要るのか
 *
 * `ElementNode.exportJSON()` が返す `children` は**常に空配列**
 * （lexical の `LexicalElementNode.ts`）。子を埋めるのは editor state 全体を
 * 書き出す経路の責務で、単体ノードを直接 `exportJSON()` しても中身は付いてこない。
 *
 * これを知らずに `node.exportJSON()` → `$parseSerializedNode()` で複製すると、
 * **枠だけで中身が全部消えた箱**が挿入される（監査 F-28）。段落なら空段落、
 * Group / Callout / Collapsible / Layout なら空のコンテナ。`DecoratorNode` は
 * state を `exportJSON` に持つので複製できてしまい、「画像は複製できるのに
 * 段落だけ空になる」という一貫性のない挙動になっていた。
 *
 * 同じ欠陥が `DraggableBlockPlugin`（⋮⋮ メニューの「複製」）と
 * `BlockTemplatePlugin`（ブロックテンプレートの保存）の両方にあったので、
 * 判断を 1 箇所に閉じる。
 *
 * ## 使い方
 *
 * `editor.update()` の中で呼ぶ（`$` prefix はその契約を表す）。戻り値は
 * `$parseSerializedNode()` にそのまま渡せる。
 */
export function $serializeNodeDeep(node: LexicalNode): SerializedLexicalNode {
  if (!$isElementNode(node)) return node.exportJSON();

  // `ElementNode.exportJSON()` の宣言型は `SerializedElementNode` なので、
  // `children` を持つ形として受け直してから widen する（返り値の型に直接
  // オブジェクトリテラルを書くと、excess property check が `children` を弾く）。
  const serialized: SerializedElementNode = node.exportJSON();
  const withChildren: SerializedElementNode = {
    ...serialized,
    children: node.getChildren().map((child) => $serializeNodeDeep(child)),
  };
  return withChildren;
}
