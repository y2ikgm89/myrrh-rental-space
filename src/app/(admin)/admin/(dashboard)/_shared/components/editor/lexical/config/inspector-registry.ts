/**
 * Inspector Registry
 *
 * @description Inspectable ノードの判定関数。型ガードによる if 文チェーンで
 * Discriminated Union の各メンバーを型安全に構築する。
 *
 * 新しいInspectableノードを追加する場合：
 * 1. getInspectableInfo に if 分岐を追加
 * 2. INSPECTABLE_NODE_TYPES に nodeType を追加
 * 3. inspectable-nodes.ts の SelectedNodeInfo にユニオンメンバーを追加
 * 4. InspectorSidebar.tsx の renderPanel に case を追加
 * 5. 対応する InspectorPanel コンポーネントを作成
 */

import type { LexicalNode } from "lexical";

import { $isCodeNode } from "@lexical/code";
import { $isButtonNode } from "../nodes/ButtonNode";
import { $isImageNode } from "../nodes/ImageNode";
import { $isCalloutNode } from "../nodes/CalloutNode";
import { $isBookmarkNode } from "../nodes/BookmarkNode";
import { $isPullQuoteNode } from "../nodes/PullQuoteNode";
import { $isRubyNode } from "../nodes/RubyNode";
import { $isTooltipNode } from "../nodes/TooltipNode";
import { $isCollapsibleContainerNode } from "../nodes/CollapsibleContainerNode";
import { $isStepsContainerNode } from "../nodes/StepsContainerNode";
import { $isTabsContainerNode } from "../nodes/TabsContainerNode";
import { $isLayoutContainerNode } from "../nodes/LayoutContainerNode";
import { $isYouTubeNode } from "../nodes/YouTubeNode";
import { $isVimeoNode } from "../nodes/VimeoNode";
import { $isMapEmbedNode } from "../nodes/MapEmbedNode";
import { $isXNode } from "../nodes/XNode";
import { $isInstagramNode } from "../nodes/InstagramNode";
import { $isPageBreakNode } from "../nodes/PageBreakNode";
import { $isAudioNode } from "../nodes/AudioNode";
import { $isFileNode } from "../nodes/FileNode";
import { $isFigmaNode } from "../nodes/FigmaNode";
import { $isSpotifyNode } from "../nodes/SpotifyNode";
import {
  $isGalleryContainerNode,
  $isGalleryItemNode,
} from "../nodes/GalleryNode";
import {
  $isTimelineContainerNode,
  $isTimelineItemNode,
} from "../nodes/TimelineNode";
import {
  $isPricingPlanNode,
  $isPricingFeatureNode,
} from "../nodes/PricingTableNode";
import { $isInlineImageNode } from "../nodes/InlineImageNode";
import {
  $isTestimonialContainerNode,
  $isTestimonialItemNode,
} from "../nodes/TestimonialNode";
import {
  $isFeatureIconListContainerNode,
  $isFeatureIconItemNode,
} from "../nodes/FeatureIconListNode";
import { $isCoverNode } from "../nodes/CoverNode";
import { $isCustomTableNode } from "../nodes/CustomTableNode";
import { $isCustomTableCellNode } from "../nodes/CustomTableCellNode";
import type {
  InspectableNodeType,
  InspectableResult,
} from "../inspector/hooks/inspectable-nodes";

// =============================================================================
// Functions
// =============================================================================

/**
 * LexicalノードがInspectable対象かどうかを判定し、型情報を返す
 *
 * 各 $isXxxNode 型ガードが node を具体的な型に絞り込むため、
 * 戻り値は InspectableResult の各 Discriminated Union メンバーに直接マッチする。
 */
export function getInspectableInfoFromRegistry(
  node: LexicalNode,
): InspectableResult | null {
  const nodeKey = node.getKey();
  if ($isButtonNode(node)) return { nodeType: "button", node, nodeKey };
  if ($isImageNode(node)) return { nodeType: "image", node, nodeKey };
  if ($isCalloutNode(node)) return { nodeType: "callout", node, nodeKey };
  if ($isBookmarkNode(node)) return { nodeType: "bookmark", node, nodeKey };
  if ($isPullQuoteNode(node)) return { nodeType: "pullQuote", node, nodeKey };
  if ($isRubyNode(node)) return { nodeType: "ruby", node, nodeKey };
  if ($isTooltipNode(node)) return { nodeType: "tooltip", node, nodeKey };
  if ($isCollapsibleContainerNode(node))
    return { nodeType: "collapsible", node, nodeKey };
  if ($isStepsContainerNode(node)) return { nodeType: "steps", node, nodeKey };
  if ($isTabsContainerNode(node)) return { nodeType: "tabs", node, nodeKey };
  if ($isLayoutContainerNode(node))
    return { nodeType: "layout", node, nodeKey };
  if ($isYouTubeNode(node)) return { nodeType: "youtube", node, nodeKey };
  if ($isVimeoNode(node)) return { nodeType: "vimeo", node, nodeKey };
  if ($isXNode(node)) return { nodeType: "x", node, nodeKey };
  if ($isInstagramNode(node)) return { nodeType: "instagram", node, nodeKey };
  if ($isPageBreakNode(node)) return { nodeType: "pageBreak", node, nodeKey };
  if ($isMapEmbedNode(node)) return { nodeType: "mapEmbed", node, nodeKey };
  if ($isCodeNode(node)) return { nodeType: "code", node, nodeKey };
  if ($isAudioNode(node)) return { nodeType: "audio", node, nodeKey };
  if ($isFileNode(node)) return { nodeType: "file", node, nodeKey };
  if ($isFigmaNode(node)) return { nodeType: "figma", node, nodeKey };
  if ($isSpotifyNode(node)) return { nodeType: "spotify", node, nodeKey };
  if ($isGalleryContainerNode(node))
    return { nodeType: "galleryContainer", node, nodeKey };
  if ($isGalleryItemNode(node))
    return { nodeType: "galleryItem", node, nodeKey };
  if ($isTimelineContainerNode(node))
    return { nodeType: "timelineContainer", node, nodeKey };
  if ($isTimelineItemNode(node))
    return { nodeType: "timelineItem", node, nodeKey };
  if ($isPricingPlanNode(node))
    return { nodeType: "pricingPlan", node, nodeKey };
  if ($isPricingFeatureNode(node))
    return { nodeType: "pricingFeature", node, nodeKey };
  if ($isInlineImageNode(node))
    return { nodeType: "inlineImage", node, nodeKey };
  if ($isTestimonialContainerNode(node))
    return { nodeType: "testimonialContainer", node, nodeKey };
  if ($isTestimonialItemNode(node))
    return { nodeType: "testimonialItem", node, nodeKey };
  if ($isFeatureIconListContainerNode(node))
    return { nodeType: "featureIconListContainer", node, nodeKey };
  if ($isFeatureIconItemNode(node))
    return { nodeType: "featureIconItem", node, nodeKey };
  if ($isCoverNode(node)) return { nodeType: "cover", node, nodeKey };
  // TableCellNode を先に判定（TableNode の子なので先にマッチさせる）
  if ($isCustomTableCellNode(node))
    return { nodeType: "tableCell", node, nodeKey };
  if ($isCustomTableNode(node)) return { nodeType: "table", node, nodeKey };
  return null;
}

/**
 * 対応しているノードタイプの一覧
 */
export const INSPECTABLE_NODE_TYPES_FROM_REGISTRY: readonly InspectableNodeType[] =
  [
    "button",
    "image",
    "callout",
    "bookmark",
    "pullQuote",
    "ruby",
    "tooltip",
    "collapsible",
    "steps",
    "tabs",
    "layout",
    "youtube",
    "vimeo",
    "x",
    "instagram",
    "pageBreak",
    "mapEmbed",
    "code",
    "audio",
    "file",
    "figma",
    "spotify",
    "galleryContainer",
    "galleryItem",
    "timelineContainer",
    "timelineItem",
    "pricingPlan",
    "pricingFeature",
    "inlineImage",
    "testimonialContainer",
    "testimonialItem",
    "featureIconListContainer",
    "featureIconItem",
    "cover",
    "table",
    "tableCell",
  ];
