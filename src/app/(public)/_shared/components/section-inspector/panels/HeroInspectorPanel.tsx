'use client'

/**
 * Hero Inspector Panel
 *
 * Heroセクションの設定編集パネル
 */

import { useCallback, useState } from 'react'
import { useSectionUpdater } from '@/public/hooks'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { type HeroConfig, getHeroConfig } from '@/shared/lib/validations/homepage-section'
import type { CTAButtonItem } from '@/shared/lib/validations/section-design'
import { CTAButtonEditor } from '@/shared/components/cta-button-editor'
import { SectionInspectorSection } from '../SectionInspectorSection'
import { Label, Input, Textarea, SaveButton } from '../form-controls'

// =============================================================================
// Types
// =============================================================================

type HeroInspectorPanelProps = {
  section: HomepageSectionData
}

// =============================================================================
// Component
// =============================================================================

export function HeroInspectorPanel({ section }: HeroInspectorPanelProps) {
  const config = getHeroConfig(section.config)
  const { updateConfig, isPending } = useSectionUpdater({ sectionId: section.id })

  // ローカルステート（フォーム編集用）
  const [title, setTitle] = useState(config.title)
  const [subtitle, setSubtitle] = useState(config.subtitle ?? '')
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(config.backgroundImageUrl ?? '')
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons)

  const handleSave = useCallback(() => {
    const newConfig: HeroConfig = {
      ...config,
      title,
      subtitle: subtitle || undefined,
      backgroundImageUrl: backgroundImageUrl || undefined,
      buttons,
    }
    updateConfig(newConfig)
  }, [
    config,
    title,
    subtitle,
    backgroundImageUrl,
    buttons,
    updateConfig,
  ])

  return (
    <div>
      <SectionInspectorSection title="メインテキスト">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hero-title">タイトル</Label>
            <Input
              id="hero-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="メインキャッチコピー"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-subtitle">サブタイトル</Label>
            <Textarea
              id="hero-subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="補足説明（任意）"
              rows={2}
            />
          </div>
        </div>
      </SectionInspectorSection>

      <SectionInspectorSection title="背景画像">
        <div className="space-y-1.5">
          <Label htmlFor="hero-bg">画像URL</Label>
          <Input
            id="hero-bg"
            value={backgroundImageUrl}
            onChange={(e) => setBackgroundImageUrl(e.target.value)}
            placeholder="https://..."
          />
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
