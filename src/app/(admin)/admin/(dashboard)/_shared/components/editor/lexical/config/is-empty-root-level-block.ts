import { $isElementNode, $isRootOrShadowRoot, type LexicalNode } from "lexical";

/**
 * URL 単独ペーストの対象になる空ブロックか。
 *
 * ブロック自身が root / shadow-root の直下で、かつ空であること。
 * ネストした空段落では発火しない（F-101）。
 */
export function $isEmptyRootLevelBlock(node: LexicalNode): boolean {
  const block = $isElementNode(node) ? node : node.getParent();
  return (
    block != null &&
    $isRootOrShadowRoot(block.getParent()) &&
    block.getTextContent() === ""
  );
}
