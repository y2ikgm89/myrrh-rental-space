/**
 * Inspectable Nodes
 *
 * @description インスペクター対象ノードの型定義と判定ユーティリティ
 *
 * 新しいノードタイプを追加する場合：
 * 1. SelectedNodeInfoにユニオンメンバーを追加
 * 2. config/inspector-registry.ts にエントリーを追加
 * 3. InspectorSidebar.tsxのrenderPanelにcaseを追加
 * 4. 対応するInspectorPanelコンポーネントを作成
 */

import type { NodeKey } from 'lexical'
import type { CodeNode } from '@lexical/code'

import type { ButtonNode } from '../../nodes/ButtonNode'
import type { ImageNode } from '../../nodes/ImageNode'
import type { CalloutNode } from '../../nodes/CalloutNode'
import type { BookmarkNode } from '../../nodes/BookmarkNode'
import type { PullQuoteNode } from '../../nodes/PullQuoteNode'
import type { CollapsibleContainerNode } from '../../nodes/CollapsibleContainerNode'
import type { StepsContainerNode } from '../../nodes/StepsContainerNode'
import type { TabsContainerNode } from '../../nodes/TabsContainerNode'
import type { LayoutContainerNode } from '../../nodes/LayoutContainerNode'
import type { YouTubeNode } from '../../nodes/YouTubeNode'
import type { VimeoNode } from '../../nodes/VimeoNode'
import type { XNode } from '../../nodes/XNode'
import type { InstagramNode } from '../../nodes/InstagramNode'
import type { PageBreakNode } from '../../nodes/PageBreakNode'
import type { MapEmbedNode } from '../../nodes/MapEmbedNode'
import type { AudioNode } from '../../nodes/AudioNode'
import type { FileNode } from '../../nodes/FileNode'
import type { FigmaNode } from '../../nodes/FigmaNode'
import type { SpotifyNode } from '../../nodes/SpotifyNode'
import type { GalleryContainerNode, GalleryItemNode } from '../../nodes/GalleryNode'
import type { TimelineContainerNode, TimelineItemNode } from '../../nodes/TimelineNode'
import type { PricingPlanNode, PricingFeatureNode } from '../../nodes/PricingTableNode'
import type { InlineImageNode } from '../../nodes/InlineImageNode'
import type { TestimonialContainerNode, TestimonialItemNode } from '../../nodes/TestimonialNode'
import type { FeatureIconListContainerNode, FeatureIconItemNode } from '../../nodes/FeatureIconListNode'

// =============================================================================
// Types
// =============================================================================

export type InspectableNodeType =
  | 'button'
  | 'image'
  | 'callout'
  | 'bookmark'
  | 'pullQuote'
  | 'collapsible'
  | 'steps'
  | 'tabs'
  | 'layout'
  | 'youtube'
  | 'vimeo'
  | 'x'
  | 'instagram'
  | 'pageBreak'
  | 'mapEmbed'
  | 'code'
  | 'audio'
  | 'file'
  | 'figma'
  | 'spotify'
  | 'galleryContainer'
  | 'galleryItem'
  | 'timelineContainer'
  | 'timelineItem'
  | 'pricingPlan'
  | 'pricingFeature'
  | 'inlineImage'
  | 'testimonialContainer'
  | 'testimonialItem'
  | 'featureIconListContainer'
  | 'featureIconItem'

/**
 * 選択中ノード情報のDiscriminated Union型
 *
 * InspectorSidebar の switch 文で型安全にパネルを選択するために
 * 明示的に維持している（Record化すると node の型が any になる）
 */
export type SelectedNodeInfo =
  | { nodeType: 'button'; node: ButtonNode; nodeKey: NodeKey }
  | { nodeType: 'image'; node: ImageNode; nodeKey: NodeKey }
  | { nodeType: 'callout'; node: CalloutNode; nodeKey: NodeKey }
  | { nodeType: 'bookmark'; node: BookmarkNode; nodeKey: NodeKey }
  | { nodeType: 'pullQuote'; node: PullQuoteNode; nodeKey: NodeKey }
  | { nodeType: 'collapsible'; node: CollapsibleContainerNode; nodeKey: NodeKey }
  | { nodeType: 'steps'; node: StepsContainerNode; nodeKey: NodeKey }
  | { nodeType: 'tabs'; node: TabsContainerNode; nodeKey: NodeKey }
  | { nodeType: 'layout'; node: LayoutContainerNode; nodeKey: NodeKey }
  | { nodeType: 'youtube'; node: YouTubeNode; nodeKey: NodeKey }
  | { nodeType: 'vimeo'; node: VimeoNode; nodeKey: NodeKey }
  | { nodeType: 'x'; node: XNode; nodeKey: NodeKey }
  | { nodeType: 'instagram'; node: InstagramNode; nodeKey: NodeKey }
  | { nodeType: 'pageBreak'; node: PageBreakNode; nodeKey: NodeKey }
  | { nodeType: 'mapEmbed'; node: MapEmbedNode; nodeKey: NodeKey }
  | { nodeType: 'code'; node: CodeNode; nodeKey: NodeKey }
  | { nodeType: 'audio'; node: AudioNode; nodeKey: NodeKey }
  | { nodeType: 'file'; node: FileNode; nodeKey: NodeKey }
  | { nodeType: 'figma'; node: FigmaNode; nodeKey: NodeKey }
  | { nodeType: 'spotify'; node: SpotifyNode; nodeKey: NodeKey }
  | { nodeType: 'galleryContainer'; node: GalleryContainerNode; nodeKey: NodeKey }
  | { nodeType: 'galleryItem'; node: GalleryItemNode; nodeKey: NodeKey }
  | { nodeType: 'timelineContainer'; node: TimelineContainerNode; nodeKey: NodeKey }
  | { nodeType: 'timelineItem'; node: TimelineItemNode; nodeKey: NodeKey }
  | { nodeType: 'pricingPlan'; node: PricingPlanNode; nodeKey: NodeKey }
  | { nodeType: 'pricingFeature'; node: PricingFeatureNode; nodeKey: NodeKey }
  | { nodeType: 'inlineImage'; node: InlineImageNode; nodeKey: NodeKey }
  | { nodeType: 'testimonialContainer'; node: TestimonialContainerNode; nodeKey: NodeKey }
  | { nodeType: 'testimonialItem'; node: TestimonialItemNode; nodeKey: NodeKey }
  | { nodeType: 'featureIconListContainer'; node: FeatureIconListContainerNode; nodeKey: NodeKey }
  | { nodeType: 'featureIconItem'; node: FeatureIconItemNode; nodeKey: NodeKey }
  | null

/**
 * null以外のSelectedNodeInfo
 * @internal
 */
export type InspectableResult = Exclude<SelectedNodeInfo, null>

// =============================================================================
// Re-exports from Registry
// =============================================================================

export {
  getInspectableInfoFromRegistry as getInspectableInfo,
  INSPECTABLE_NODE_TYPES_FROM_REGISTRY as INSPECTABLE_NODE_TYPES,
} from '../../config/inspector-registry'
