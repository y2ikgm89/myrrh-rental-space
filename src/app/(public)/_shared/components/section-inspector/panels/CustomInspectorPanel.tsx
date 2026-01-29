'use client'

/**
 * Custom Inspector Panel
 *
 * カスタムセクションの設定編集パネル
 * コンテンツはインライン編集で行うため、ここでは情報表示のみ
 */

import type { HomepageSectionData } from '@/public/actions/homepage'
import { SectionInspectorSection } from '../SectionInspectorSection'

// =============================================================================
// Types
// =============================================================================

type CustomInspectorPanelProps = {
  section: HomepageSectionData
}

// =============================================================================
// Component
// =============================================================================

export function CustomInspectorPanel({ section }: CustomInspectorPanelProps) {
  return (
    <div>
      <SectionInspectorSection title="カスタムセクション">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            このセクションのコンテンツは、ページ上で直接編集できます。
          </p>
          {section.title && (
            <p className="text-xs">
              <span className="text-muted-foreground">タイトル: </span>
              {section.title}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            詳細な設定は管理画面から行ってください。
          </p>
        </div>
      </SectionInspectorSection>
    </div>
  )
}
