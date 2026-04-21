/**
 * Selection Helpers
 *
 * @description 選択状態から「ブロックレベル操作の対象ノード」を抽出する SSoT
 *
 * アルゴリズム: 選択中ノード群の **deepest common ancestor** を求め、
 * その直接 block-level 子のうちセレクションに含まれるものを返す
 * （WordPress Gutenberg の `getCommonRootClientID` と同等のセマンティクス）。
 *
 * これにより以下の UX が統一される:
 * - Root 直下の G1 + G2 を選択 → [G1, G2]（outer Group ラップ可能）
 * - Group 内の P1 + P2 を選択 → [P1, P2]（inner Group ラップ可能 = ネスト）
 * - 単一段落内テキスト選択 → [P]（単独ブロック fallback）
 * - collapsed カーソル → [そのブロック]（キーボードショートカット用）
 *
 * @see https://wordpress.org/documentation/article/group-block/#converting-multiple-blocks-to-a-group-block
 */

import {
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  type LexicalNode,
} from "lexical";

/**
 * block-level ノード判定（Lexical 公式の isInline() セマンティクスに準拠）。
 *
 * - `ElementNode` かつ non-inline → 段落・見出し・Group・Callout 等
 * - `DecoratorNode` かつ non-inline → 画像・YouTube・X 等の埋め込みブロック
 * - それ以外（TextNode / LineBreakNode / inline ElementNode / inline DecoratorNode）は除外
 */
function $isBlockLevel(node: LexicalNode): boolean {
  if ($isElementNode(node)) return !node.isInline();
  if ($isDecoratorNode(node)) return !node.isInline();
  return false;
}

/**
 * カーソル／選択の「ブロック粒度」に該当するノード群を返す。
 *
 * 戻り値は常に block-level ノード（ElementNode / DecoratorNode で `isInline() === false`）のみ。
 * 単一ブロック選択では 1 要素、複数ブロック選択では 2+ 要素、
 * 非 RangeSelection / 空選択では空配列。
 *
 * 詳細な分岐:
 * 1. 非 RangeSelection → `[]`
 * 2. Collapsed → カーソル位置の祖先ブロックを 1 つ返す
 * 3. Range: 共通祖先を求め、その直接子のうち block-level + 選択に含まれるものを返す
 * 4. 3 で空になった場合（= 単一ブロック内テキスト選択）→ 先頭ノードの祖先ブロックを fallback
 */
export function $getSelectionBlockNodes(): LexicalNode[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];

  if (selection.isCollapsed()) {
    return $blockAncestorAsList(selection.anchor.getNode());
  }

  const nodes = selection.getNodes();
  if (nodes.length === 0) return [];

  // 各選択ノードの root→leaf 祖先チェーンを構築
  const chains: LexicalNode[][] = nodes.map((node) => {
    const chain: LexicalNode[] = [];
    let current: LexicalNode | null = node;
    while (current !== null) {
      chain.unshift(current);
      current = current.getParent();
    }
    return chain;
  });

  const firstChain = chains[0];
  if (!firstChain) return [];

  // 共通祖先の深さを求める（= 一致する prefix 長）
  let commonDepth = 0;
  while (commonDepth < firstChain.length) {
    const candidate = firstChain[commonDepth];
    if (!candidate) break;
    const candidateKey = candidate.getKey();
    const allMatch = chains.every(
      (chain) => chain[commonDepth]?.getKey() === candidateKey,
    );
    if (!allMatch) break;
    commonDepth += 1;
  }

  // 共通祖先の直接子（= chain[commonDepth]）のうち block-level のみ収集
  const seen = new Set<string>();
  const result: LexicalNode[] = [];
  for (const chain of chains) {
    const node = chain[commonDepth];
    if (!node) continue;
    if (!$isBlockLevel(node)) continue;
    const key = node.getKey();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(node);
    }
  }

  // 単一ブロック内テキスト選択: 共通子が非 block-level のみ → 先頭ノードの祖先ブロックへ fallback
  if (result.length === 0 && nodes[0] !== undefined) {
    return $blockAncestorAsList(nodes[0]);
  }

  return result;
}

/**
 * 現在の選択が 2 つ以上のブロックを跨いでいるかを判定する。
 *
 * - Floating Text Format Toolbar: `true` のとき非表示（block 操作に委譲）
 * - Floating Block Selection Toolbar: `true` のときのみ表示
 */
export function $isMultiBlockSelection(): boolean {
  return $getSelectionBlockNodes().length >= 2;
}

/**
 * 与えられたノードから上位へ辿り、最初に見つかった block-level ノードを 1 要素配列として返す。
 * block-level の定義は `$isBlockLevel` に準拠（ElementNode + DecoratorNode の non-inline）。
 */
function $blockAncestorAsList(node: LexicalNode): LexicalNode[] {
  let current: LexicalNode | null = node;
  while (current !== null) {
    if ($isBlockLevel(current)) {
      return [current];
    }
    current = current.getParent();
  }
  return [];
}
