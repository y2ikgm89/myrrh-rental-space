'use client'

/**
 * 右パネル — コンテンツ/デザインのタブ切替
 *
 * コンテンツタブ: タイトル入力 + configFormRegistry[type]
 * デザインタブ: 汎化版 DesignPanel
 */

import { Suspense, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/admin/components/ui'
import {
  updatePageSection,
  type PageSectionData,
} from '@/admin/actions/page-section'
import type { SectionDesign } from '@/shared/lib/validations/section'
import { SectionDetailHeader } from './SectionDetailHeader'
import { SectionEmptyState } from './SectionEmptyState'
import { configFormRegistry, type ConfigFormSavePayload } from '../../sections/_components/config-forms'
import { DesignPanel } from '../../../../settings/_components/homepage/DesignPanel'

interface SectionDetailPanelProps {
  section: PageSectionData | null
  hasSections: boolean
  onAddSection: () => void
  onSectionUpdated: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export function SectionDetailPanel({
  section,
  hasSections,
  onAddSection,
  onSectionUpdated,
  onDirtyChange,
}: SectionDetailPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [configDirty, setConfigDirty] = useState(false)
  const [designDirty, setDesignDirty] = useState(false)

  // dirty集約: config or design のいずれかがdirtyなら通知
  useEffect(() => {
    onDirtyChange?.(configDirty || designDirty)
  }, [configDirty, designDirty, onDirtyChange])

  // セクション変更時にdirtyリセット
  useEffect(() => {
    // セクションが変更されたら、次のレンダリング時にdirtyをリセット
    return () => {
      setConfigDirty(false)
      setDesignDirty(false)
    }
  }, [section?.id])

  if (!section) {
    return <SectionEmptyState hasSections={hasSections} onAddSection={onAddSection} />
  }

  const ConfigForm = configFormRegistry[section.type]

  const handleConfigSave = (payload: ConfigFormSavePayload) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: payload.config,
        ...(payload.contentJson !== undefined ? { contentJson: payload.contentJson } : {}),
      })
      if (result.success) {
        toast.success(result.message)
        onSectionUpdated()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleTitleSave = (title: string) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, { title })
      if (result.success) {
        toast.success('タイトルを更新しました')
        onSectionUpdated()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDesignSave = (design: SectionDesign) => {
    startTransition(async () => {
      // SectionDesign → Record<string, unknown>: Zodバリデーション済みデザイン設定をJSON入力形式に変換
      const designRecord: Record<string, unknown> = Object.fromEntries(Object.entries(design))
      const result = await updatePageSection(section.id, {
        design: designRecord,
      })
      if (result.success) {
        toast.success('デザインを更新しました')
        onSectionUpdated()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      <SectionDetailHeader section={section} />

      <Tabs defaultValue="content" className="w-full">
        <TabsList>
          <TabsTrigger value="content">コンテンツ</TabsTrigger>
          <TabsTrigger value="design">デザイン</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4 space-y-6">
          {/* セクションタイトル */}
          <SectionTitleField
            title={section.title ?? ''}
            onSave={handleTitleSave}
            isPending={isPending}
          />

          {/* Config Form */}
          {ConfigForm ? (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-lg bg-muted" />
              }
            >
              <ConfigForm
                section={section}
                onSave={handleConfigSave}
                isPending={isPending}
                onDirtyChange={setConfigDirty}
              />
            </Suspense>
          ) : (
            <p className="text-sm text-muted-foreground">
              このセクションタイプにはコンテンツ設定がありません
            </p>
          )}
        </TabsContent>

        <TabsContent value="design" className="mt-4">
          <DesignPanel
            section={{
              id: section.id,
              type: section.type,
              design: section.design,
            }}
            onDesignSave={handleDesignSave}
            onDirtyChange={setDesignDirty}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// =============================================================================
// Section Title Field (inline)
// =============================================================================

function SectionTitleField({
  title,
  onSave,
  isPending,
}: {
  title: string
  onSave: (title: string) => void
  isPending: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="section-title">セクションタイトル（管理用）</Label>
      <Input
        id="section-title"
        defaultValue={title}
        placeholder="セクション名..."
        disabled={isPending}
        onBlur={(e) => {
          const newTitle = e.target.value.trim()
          if (newTitle !== title) {
            onSave(newTitle)
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        管理画面でのセクション識別用。空欄時はタイプ名が表示されます
      </p>
    </div>
  )
}
