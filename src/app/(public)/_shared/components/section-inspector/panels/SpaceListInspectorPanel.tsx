'use client'

/**
 * SpaceList Inspector Panel
 *
 * スペース一覧セクションの設定編集パネル
 */

import { useCallback, useState } from 'react'
import { useSectionUpdater } from '@/public/hooks'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { type SpaceListConfig, getSpaceListConfig } from '@/shared/lib/validations/homepage-section'
import { SectionInspectorSection } from '../SectionInspectorSection'
import { Label, NumberInput, Switch, SaveButton } from '../form-controls'

// =============================================================================
// Types
// =============================================================================

type SpaceListInspectorPanelProps = {
  section: HomepageSectionData
}

// =============================================================================
// Component
// =============================================================================

export function SpaceListInspectorPanel({ section }: SpaceListInspectorPanelProps) {
  const config = getSpaceListConfig(section.config)
  const { updateConfig, isPending } = useSectionUpdater({ sectionId: section.id })

  // ローカルステート
  const [maxItems, setMaxItems] = useState(config.maxItems)
  const [showOnlyPublished, setShowOnlyPublished] = useState(config.showOnlyPublished)

  const handleSave = useCallback(() => {
    const newConfig: SpaceListConfig = {
      ...config,
      maxItems,
      showOnlyPublished,
    }
    updateConfig(newConfig)
  }, [config, maxItems, showOnlyPublished, updateConfig])

  return (
    <div>
      <SectionInspectorSection title="表示設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="space-max-items">表示件数</Label>
            <NumberInput
              id="space-max-items"
              value={maxItems}
              onChange={setMaxItems}
              min={1}
              max={12}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="space-published-only" className="cursor-pointer">
              公開中のスペースのみ表示
            </Label>
            <Switch
              id="space-published-only"
              checked={showOnlyPublished}
              onCheckedChange={setShowOnlyPublished}
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
