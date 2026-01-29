'use client'

/**
 * CTA Inspector Panel
 *
 * CTAセクションの設定編集パネル
 */

import { useCallback, useState } from 'react'
import { useSectionUpdater } from '@/public/hooks'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { type CtaConfig, getCtaConfig } from '@/shared/lib/validations/homepage-section'
import type { CTAButtonItem } from '@/shared/lib/validations/section-design'
import { CTAButtonEditor } from '@/shared/components/cta-button-editor'
import { SectionInspectorSection } from '../SectionInspectorSection'
import { Label, Input, Textarea, SaveButton } from '../form-controls'

// =============================================================================
// Types
// =============================================================================

type CtaInspectorPanelProps = {
  section: HomepageSectionData
}

// =============================================================================
// Component
// =============================================================================

export function CtaInspectorPanel({ section }: CtaInspectorPanelProps) {
  const config = getCtaConfig(section.config)
  const { updateConfig, isPending } = useSectionUpdater({ sectionId: section.id })

  // ローカルステート
  const [title, setTitle] = useState(config.title)
  const [description, setDescription] = useState(config.description ?? '')
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)

  const handleSave = useCallback(() => {
    const newConfig: CtaConfig = {
      ...config,
      title,
      description: description || undefined,
      buttons,
    }
    updateConfig(newConfig)
  }, [
    config,
    title,
    description,
    buttons,
    updateConfig,
  ])

  return (
    <div>
      <SectionInspectorSection title="テキスト">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cta-title">タイトル</Label>
            <Input
              id="cta-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cta-description">説明文</Label>
            <Textarea
              id="cta-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </SectionInspectorSection>

      <SectionInspectorSection title="ボタン">
        <CTAButtonEditor
          buttons={buttons}
          onChange={setButtons}
          disabled={isPending}
          compact
        />
      </SectionInspectorSection>

      <div className="p-4">
        <SaveButton isPending={isPending} onClick={handleSave} />
      </div>
    </div>
  )
}
