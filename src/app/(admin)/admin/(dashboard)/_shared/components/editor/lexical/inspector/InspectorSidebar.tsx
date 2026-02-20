/**
 * Inspector Sidebar
 *
 * @description 選択中ノードのプロパティ編集サイドバー
 */

'use client'

import { useSelectedNode, type SelectedNodeInfo } from './hooks/use-selected-node'
import {
  ButtonInspectorPanel,
  ImageInspectorPanel,
  CalloutInspectorPanel,
  BookmarkInspectorPanel,
  PullQuoteInspectorPanel,
  CollapsibleInspectorPanel,
  StepsInspectorPanel,
  TabsInspectorPanel,
  LayoutInspectorPanel,
  YouTubeInspectorPanel,
  VimeoInspectorPanel,
  XInspectorPanel,
  InstagramInspectorPanel,
  PageBreakInspectorPanel,
} from './panels'
import { Settings2 } from 'lucide-react'

// =============================================================================
// Panel Renderer
// =============================================================================

/**
 * Discriminated Unionにより型ガードなしで型安全にパネルをレンダリング
 */
function renderPanel(info: SelectedNodeInfo) {
  if (!info) return null

  switch (info.nodeType) {
    case 'button':
      return <ButtonInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'image':
      return <ImageInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'callout':
      return <CalloutInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'bookmark':
      return <BookmarkInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'pullQuote':
      return <PullQuoteInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'collapsible':
      return <CollapsibleInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'steps':
      return <StepsInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'tabs':
      return <TabsInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'layout':
      return <LayoutInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'youtube':
      return <YouTubeInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'vimeo':
      return <VimeoInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'x':
      return <XInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'instagram':
      return <InstagramInspectorPanel nodeKey={info.nodeKey} node={info.node} />
    case 'pageBreak':
      return <PageBreakInspectorPanel />
  }
}

// =============================================================================
// Component
// =============================================================================

export function InspectorSidebar() {
  const selectedNode = useSelectedNode()

  return (
    <div className="w-64 border-l border-border bg-background flex flex-col h-full">
      {selectedNode ? (
        <div className="flex-1 overflow-y-auto">{renderPanel(selectedNode)}</div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4">
          <Settings2 className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm text-center">
            ブロックを選択すると
            <br />
            設定を編集できます
          </p>
        </div>
      )}
    </div>
  )
}
