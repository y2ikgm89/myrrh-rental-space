'use client'

/**
 * List Section Inspector Panel
 *
 * News/Posts共通のリスト表示セクション設定パネル
 */

import { useCallback, useState } from 'react'
import { useSectionUpdater } from '@/public/hooks'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { SectionInspectorSection } from '../SectionInspectorSection'
import { Label, Input, NumberInput, Switch, SaveButton } from '../form-controls'

// =============================================================================
// Types
// =============================================================================

type ListSectionInspectorPanelProps = {
  section: HomepageSectionData
  config: {
    title: string
    maxItems: number
    showViewAllLink: boolean
    [key: string]: unknown
  }
  idPrefix: string
  maxItemsLimit?: number
}

// =============================================================================
// Component
// =============================================================================

export function ListSectionInspectorPanel({
  section,
  config,
  idPrefix,
  maxItemsLimit = 10,
}: ListSectionInspectorPanelProps) {
  const { updateConfig, isPending } = useSectionUpdater({ sectionId: section.id })

  const [title, setTitle] = useState(config.title)
  const [maxItems, setMaxItems] = useState(config.maxItems)
  const [showViewAllLink, setShowViewAllLink] = useState(config.showViewAllLink)

  const handleSave = useCallback(() => {
    const newConfig = {
      ...config,
      title,
      maxItems,
      showViewAllLink,
    }
    updateConfig(newConfig, section.title ?? undefined)
  }, [config, title, maxItems, showViewAllLink, section.title, updateConfig])

  return (
    <div>
      <SectionInspectorSection title="表示設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-title`}>セクションタイトル</Label>
            <Input
              id={`${idPrefix}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-max-items`}>表示件数</Label>
            <NumberInput
              id={`${idPrefix}-max-items`}
              value={maxItems}
              onChange={setMaxItems}
              min={1}
              max={maxItemsLimit}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor={`${idPrefix}-view-all`} className="cursor-pointer">
              「すべて見る」リンクを表示
            </Label>
            <Switch
              id={`${idPrefix}-view-all`}
              checked={showViewAllLink}
              onCheckedChange={setShowViewAllLink}
            />
          </div>
        </div>
      </SectionInspectorSection>

      <div className="p-4">
        <SaveButton isPending={isPending} onClick={handleSave} />
      </div>
    </div>
  )
}
