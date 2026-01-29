'use client'

/**
 * Instagram Inspector Panel
 *
 * Instagramセクションの設定編集パネル
 */

import { useCallback, useState } from 'react'
import { useSectionUpdater } from '@/public/hooks'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { type InstagramConfig, getInstagramConfig } from '@/shared/lib/validations/homepage-section'
import { SectionInspectorSection } from '../SectionInspectorSection'
import { Label, Input, SaveButton } from '../form-controls'

// =============================================================================
// Types
// =============================================================================

type InstagramInspectorPanelProps = {
  section: HomepageSectionData
}

// =============================================================================
// Component
// =============================================================================

export function InstagramInspectorPanel({ section }: InstagramInspectorPanelProps) {
  const config = getInstagramConfig(section.config)
  const { updateConfig, isPending } = useSectionUpdater({ sectionId: section.id })

  // ローカルステート
  const [title, setTitle] = useState(config.title)

  const handleSave = useCallback(() => {
    const newConfig: InstagramConfig = {
      ...config,
      title,
    }
    updateConfig(newConfig, section.title ?? undefined)
  }, [config, title, section.title, updateConfig])

  return (
    <div>
      <SectionInspectorSection title="表示設定">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="instagram-title">セクションタイトル</Label>
            <Input
              id="instagram-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
      </SectionInspectorSection>

      <SectionInspectorSection title="Instagram連携" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">
          Instagramフィードの設定は管理画面から行ってください。
        </p>
      </SectionInspectorSection>

      <div className="p-4">
        <SaveButton isPending={isPending} onClick={handleSave} />
      </div>
    </div>
  )
}
