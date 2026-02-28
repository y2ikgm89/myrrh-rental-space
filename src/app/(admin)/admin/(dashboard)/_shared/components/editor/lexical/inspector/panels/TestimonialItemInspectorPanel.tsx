/**
 * Testimonial Item Inspector Panel
 *
 * @description TestimonialItemNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $isTestimonialItemNode,
  type TestimonialItemNode,
  type TestimonialRating,
  testimonialAuthorNameState,
  testimonialAuthorTitleState,
  testimonialAvatarUrlState,
  testimonialRatingState,
  testimonialDateState,
} from '../../nodes/TestimonialNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Input, Label } from '@/admin/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'

// =============================================================================
// Constants
// =============================================================================

const RATING_OPTIONS: readonly { value: TestimonialRating; label: string }[] = [
  { value: 1, label: '★☆☆☆☆ (1)' },
  { value: 2, label: '★★☆☆☆ (2)' },
  { value: 3, label: '★★★☆☆ (3)' },
  { value: 4, label: '★★★★☆ (4)' },
  { value: 5, label: '★★★★★ (5)' },
]

// =============================================================================
// Types
// =============================================================================

type TestimonialItemInspectorPanelProps = {
  nodeKey: string
  node: TestimonialItemNode
}

// =============================================================================
// Component
// =============================================================================

export function TestimonialItemInspectorPanel({ nodeKey, node }: TestimonialItemInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isTestimonialItemNode)

  const { authorName, authorTitle, avatarUrl, rating, date } = editor.getEditorState().read(() => ({
    authorName: $getState(node, testimonialAuthorNameState),
    authorTitle: $getState(node, testimonialAuthorTitleState),
    avatarUrl: $getState(node, testimonialAvatarUrlState),
    rating: $getState(node, testimonialRatingState),
    date: $getState(node, testimonialDateState),
  }))

  const handleAuthorNameChange = (value: string) => {
    updateNode((n) => { $setState(n, testimonialAuthorNameState, value) })
  }

  const handleAuthorTitleChange = (value: string) => {
    updateNode((n) => { $setState(n, testimonialAuthorTitleState, value) })
  }

  const handleAvatarUrlChange = (value: string) => {
    updateNode((n) => { $setState(n, testimonialAvatarUrlState, value) })
  }

  const handleRatingChange = (value: string) => {
    const parsed = parseInt(value, 10)
    if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5) {
      updateNode((n) => { $setState(n, testimonialRatingState, parsed) })
    }
  }

  const handleDateChange = (value: string) => {
    updateNode((n) => { $setState(n, testimonialDateState, value) })
  }

  return (
    <div>
      <InspectorHeader title="口コミアイテム" />

      <InspectorSection title="投稿者情報">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">名前</Label>
            <Input
              value={authorName}
              onChange={(e) => handleAuthorNameChange(e.target.value)}
              placeholder="山田太郎"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">肩書き・役職</Label>
            <Input
              value={authorTitle}
              onChange={(e) => handleAuthorTitleChange(e.target.value)}
              placeholder="CEO / 会社名"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">アバター画像 URL</Label>
            <Input
              value={avatarUrl}
              onChange={(e) => handleAvatarUrlChange(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="評価">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">評価（星）</Label>
            <Select value={String(rating)} onValueChange={handleRatingChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">投稿日</Label>
            <Input
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              placeholder="2024-01-01"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  )
}
