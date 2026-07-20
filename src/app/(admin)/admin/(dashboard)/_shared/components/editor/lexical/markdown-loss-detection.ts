/**
 * Markdown 変換非対応ノードの検出
 *
 * @description EDITOR_TRANSFORMERS（MarkdownTransformers.ts）には Markdown 表現を
 * 持たない embed / 構造系ノードが編集内容に含まれるかどうかを判定する。
 * Markdown コピー実行前に呼び出し、含まれる場合は呼び出し側で
 * 「変換できない内容が失われる」警告を表示する。
 *
 * 対象は現状 Markdown 表現を持たない node のみ（新規 custom node を
 * MarkdownTransformers.ts に対応させずに追加した場合、このリストの更新が必要）。
 */

import { $dfs } from "@lexical/utils";
import type { LexicalNode } from "lexical";
import { $isInstagramNode } from "./nodes/InstagramNode";
import { $isXNode } from "./nodes/XNode";
import { $isFigmaNode } from "./nodes/FigmaNode";
import { $isSpotifyNode } from "./nodes/SpotifyNode";
import { $isVimeoNode } from "./nodes/VimeoNode";
import { $isFileNode } from "./nodes/FileNode";
import { $isAudioNode } from "./nodes/AudioNode";
import { $isCoverNode } from "./nodes/CoverNode";
import { $isGalleryContainerNode } from "./nodes/GalleryNode";
import { $isTestimonialContainerNode } from "./nodes/TestimonialNode";
import { $isTimelineContainerNode } from "./nodes/TimelineNode";
import { $isMapEmbedNode } from "./nodes/MapEmbedNode";
import { $isBookmarkNode } from "./nodes/BookmarkNode";
import { $isButtonNode } from "./nodes/ButtonNode";
import { $isCollapsibleContainerNode } from "./nodes/CollapsibleContainerNode";
import { $isStepsContainerNode } from "./nodes/StepsContainerNode";
import { $isTabsContainerNode } from "./nodes/TabsContainerNode";
import { $isLayoutContainerNode } from "./nodes/LayoutContainerNode";
import { $isInlineIconNode } from "./nodes/InlineIconNode";
import { $isInternalLinkCardNode } from "./nodes/InternalLinkCardNode";

/**
 * Markdown へ変換できない（= コピー時に silent に消える）コンテナ/embed ノードか判定する。
 * container 系はコンテナ自体を検出すれば十分（子ノードは container なしに存在しない）
 */
function isUnrepresentableInMarkdown(node: LexicalNode): boolean {
  return (
    $isInstagramNode(node) ||
    $isXNode(node) ||
    $isFigmaNode(node) ||
    $isSpotifyNode(node) ||
    $isVimeoNode(node) ||
    $isFileNode(node) ||
    $isAudioNode(node) ||
    $isCoverNode(node) ||
    $isGalleryContainerNode(node) ||
    $isTestimonialContainerNode(node) ||
    $isTimelineContainerNode(node) ||
    $isMapEmbedNode(node) ||
    $isBookmarkNode(node) ||
    $isButtonNode(node) ||
    $isCollapsibleContainerNode(node) ||
    $isStepsContainerNode(node) ||
    $isTabsContainerNode(node) ||
    $isLayoutContainerNode(node) ||
    $isInlineIconNode(node) ||
    $isInternalLinkCardNode(node)
  );
}

/**
 * 現在のエディタ内容に Markdown 表現を持たないノードが含まれるか判定する。
 * 呼び出しは editor.read() / editor.update() 内で行うこと（$ プレフィックス規約）。
 */
export function $hasUnrepresentableMarkdownContent(): boolean {
  return $dfs().some(({ node }) => isUnrepresentableInMarkdown(node));
}
