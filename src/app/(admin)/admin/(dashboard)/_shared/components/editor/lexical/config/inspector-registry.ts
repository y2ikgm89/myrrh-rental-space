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

import type { LexicalNode } from 'lexical'

import { $isButtonNode } from '../nodes/ButtonNode'
import { $isImageNode } from '../nodes/ImageNode'
import { $isCalloutNode } from '../nodes/CalloutNode'
import { $isBookmarkNode } from '../nodes/BookmarkNode'
import { $isPullQuoteNode } from '../nodes/PullQuoteNode'
import { $isCollapsibleContainerNode } from '../nodes/CollapsibleContainerNode'
import { $isStepsContainerNode } from '../nodes/StepsContainerNode'
import { $isTabsContainerNode } from '../nodes/TabsContainerNode'
import { $isLayoutContainerNode } from '../nodes/LayoutContainerNode'
import { $isYouTubeNode } from '../nodes/YouTubeNode'
import { $isVimeoNode } from '../nodes/VimeoNode'
import { $isMapEmbedNode } from '../nodes/MapEmbedNode'
import { $isXNode } from '../nodes/XNode'
import { $isInstagramNode } from '../nodes/InstagramNode'
import { $isPageBreakNode } from '../nodes/PageBreakNode'
import type { InspectableNodeType, InspectableResult } from '../inspector/hooks/inspectable-nodes'

// =============================================================================
// Functions
// =============================================================================

/**
 * LexicalノードがInspectable対象かどうかを判定し、型情報を返す
 *
 * 各 $isXxxNode 型ガードが node を具体的な型に絞り込むため、
 * 戻り値は InspectableResult の各 Discriminated Union メンバーに直接マッチする。
 */
export function getInspectableInfoFromRegistry(node: LexicalNode): InspectableResult | null {
  const nodeKey = node.getKey()
  if ($isButtonNode(node)) return { nodeType: 'button', node, nodeKey }
  if ($isImageNode(node)) return { nodeType: 'image', node, nodeKey }
  if ($isCalloutNode(node)) return { nodeType: 'callout', node, nodeKey }
  if ($isBookmarkNode(node)) return { nodeType: 'bookmark', node, nodeKey }
  if ($isPullQuoteNode(node)) return { nodeType: 'pullQuote', node, nodeKey }
  if ($isCollapsibleContainerNode(node)) return { nodeType: 'collapsible', node, nodeKey }
  if ($isStepsContainerNode(node)) return { nodeType: 'steps', node, nodeKey }
  if ($isTabsContainerNode(node)) return { nodeType: 'tabs', node, nodeKey }
  if ($isLayoutContainerNode(node)) return { nodeType: 'layout', node, nodeKey }
  if ($isYouTubeNode(node)) return { nodeType: 'youtube', node, nodeKey }
  if ($isVimeoNode(node)) return { nodeType: 'vimeo', node, nodeKey }
  if ($isXNode(node)) return { nodeType: 'x', node, nodeKey }
  if ($isInstagramNode(node)) return { nodeType: 'instagram', node, nodeKey }
  if ($isPageBreakNode(node)) return { nodeType: 'pageBreak', node, nodeKey }
  if ($isMapEmbedNode(node)) return { nodeType: 'mapEmbed', node, nodeKey }
  return null
}

/**
 * 対応しているノードタイプの一覧
 */
export const INSPECTABLE_NODE_TYPES_FROM_REGISTRY: readonly InspectableNodeType[] = [
  'button', 'image', 'callout', 'bookmark', 'pullQuote',
  'collapsible', 'steps', 'tabs', 'layout',
  'youtube', 'vimeo', 'x', 'instagram', 'pageBreak',
  'mapEmbed',
]
