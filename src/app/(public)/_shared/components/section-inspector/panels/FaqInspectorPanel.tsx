'use client'

/**
 * FAQ Inspector Panel
 *
 * FAQセクションの設定編集パネル
 */

import { useCallback, useState } from 'react'
import { useSectionUpdater } from '@/public/hooks'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { type FaqConfig, getFaqConfig } from '@/shared/lib/validations/homepage-section'
import { SectionInspectorSection } from '../SectionInspectorSection'
import { Label, Input, NumberInput, SaveButton } from '../form-controls'

// =============================================================================
// Types
// =============================================================================

type FaqInspectorPanelProps = {
  section: HomepageSectionData
}

// =============================================================================
// Component
// =============================================================================

export function FaqInspectorPanel({ section }: FaqInspectorPanelProps) {
  const config = getFaqConfig(section.config)
  const { updateConfig, isPending } = useSectionUpdater({ sectionId: section.id })

  // ローカルステート
  const [title, setTitle] = useState(config.title)
  const [maxItems, setMaxItems] = useState(config.maxItems)

  const handleSave = useCallback(() => {
    const newConfig: FaqConfig = {
      ...config,
      title,
      maxItems,
    }
    updateConfig(newConfig, section.title ?? undefined)
  }, [config, title, maxItems, section.title, updateConfig])

  return (
    <div>
      <SectionInspectorSection title="表示設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="faq-title">セクションタイトル</Label>
            <Input
              id="faq-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="faq-max-items">表示件数</Label>
            <NumberInput
              id="faq-max-items"
              value={maxItems}
              onChange={setMaxItems}
              min={1}
              max={20}
            />
          </div>
        </div>
      </SectionInspectorSection>

      <SectionInspectorSection title="カテゴリ" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          カテゴリの設定は管理画面から行ってください。
        </p>
      </SectionInspectorSection>

      <div className="p-4">
        <SaveButton isPending={isPending} onClick={handleSave} />
      </div>
    </div>
  )
}
