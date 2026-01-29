/**
 * Bookmark Inspector Panel
 *
 * @description BookmarkNodeのプロパティ編集パネル
 */

'use client'

import { useCallback } from 'react'
import { $isBookmarkNode, type BookmarkNode } from '../../nodes/BookmarkNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Input, Label, Textarea } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type BookmarkInspectorPanelProps = {
  nodeKey: string
  node: BookmarkNode
}

// =============================================================================
// Component
// =============================================================================

export function BookmarkInspectorPanel({ nodeKey, node }: BookmarkInspectorPanelProps) {
  const updateNode = useNodeUpdater(nodeKey, $isBookmarkNode)

  // 現在の値を取得
  const url = node.getUrl()
  const title = node.getTitle()
  const description = node.getDescription()
  const siteName = node.getSiteName()

  const handleTitleChange = useCallback(
    (value: string) => updateNode((n) => n.setTitle(value)),
    [updateNode]
  )

  const handleDescriptionChange = useCallback(
    (value: string) => updateNode((n) => n.setDescription(value)),
    [updateNode]
  )

  const handleSiteNameChange = useCallback(
    (value: string) => updateNode((n) => n.setSiteName(value)),
    [updateNode]
  )

  return (
    <div>
      <InspectorHeader title="ブックマーク" />

      <InspectorSection title="基本設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <p className="text-xs text-muted-foreground break-all">{url}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-bookmark-title" className="text-xs">
              タイトル
            </Label>
            <Input
              id="inspector-bookmark-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-bookmark-description" className="text-xs">
              説明
            </Label>
            <Textarea
              id="inspector-bookmark-description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              className="text-sm min-h-[60px] resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inspector-bookmark-sitename" className="text-xs">
              サイト名
            </Label>
            <Input
              id="inspector-bookmark-sitename"
              value={siteName}
              onChange={(e) => handleSiteNameChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
