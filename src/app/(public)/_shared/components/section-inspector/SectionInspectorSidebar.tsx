'use client'

/**
 * Section Inspector Sidebar
 *
 * ホームページセクション編集用サイドバー
 * 管理者がedit=trueでアクセスした場合に表示
 */

import { useState, useCallback, useMemo, type ReactElement } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { X, Settings2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { HomepageSectionType, sectionTypeLabels } from '@/shared/lib/validations/homepage-section'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { SectionInspectorHeader } from './SectionInspectorHeader'
import { SectionList } from './SectionList'
import {
  HeroInspectorPanel,
  CtaInspectorPanel,
  NewsInspectorPanel,
  PostsInspectorPanel,
  FaqInspectorPanel,
  SpaceListInspectorPanel,
  InstagramInspectorPanel,
  CustomInspectorPanel,
} from './panels'

// =============================================================================
// Types
// =============================================================================

type SectionInspectorSidebarProps = {
  sections: HomepageSectionData[]
}

// =============================================================================
// Panel Renderer
// =============================================================================

function renderPanel(section: HomepageSectionData): ReactElement | null {
  switch (section.type) {
    case HomepageSectionType.HERO:
      return <HeroInspectorPanel section={section} />
    case HomepageSectionType.CTA:
      return <CtaInspectorPanel section={section} />
    case HomepageSectionType.NEWS:
      return <NewsInspectorPanel section={section} />
    case HomepageSectionType.POST:
      return <PostsInspectorPanel section={section} />
    case HomepageSectionType.FAQ:
      return <FaqInspectorPanel section={section} />
    case HomepageSectionType.SPACE_LIST:
      return <SpaceListInspectorPanel section={section} />
    case HomepageSectionType.INSTAGRAM:
      return <InstagramInspectorPanel section={section} />
    case HomepageSectionType.CUSTOM:
      return <CustomInspectorPanel section={section} />
    default:
      return null
  }
}

// =============================================================================
// Component
// =============================================================================

export function SectionInspectorSidebar({ sections }: SectionInspectorSidebarProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isEditMode = searchParams.get('edit') === 'true'

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(true)

  // selectedSectionIdから対応するセクションを取得（isEditModeがfalseならnull）
  const selectedSection = useMemo(() => {
    if (!isEditMode || !selectedSectionId) return null
    return sections.find((s) => s.id === selectedSectionId) ?? null
  }, [isEditMode, selectedSectionId, sections])

  const handleSelectSection = useCallback((section: HomepageSectionData) => {
    setSelectedSectionId(section.id)
  }, [])

  const handleClose = useCallback(() => {
    // edit=trueを削除してページ遷移
    const params = new URLSearchParams(searchParams.toString())
    params.delete('edit')
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    router.push(newUrl)
  }, [searchParams, router])

  const handleToggleSidebar = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  // 編集モードでない場合は何も表示しない
  if (!isEditMode) {
    return null
  }

  return (
    <>
      {/* 閉じるボタン付きオーバーレイ（モバイル用） */}
      <button
        type="button"
        onClick={handleClose}
        className={cn(
          'fixed inset-0 bg-black/20 z-40 lg:hidden',
          isOpen ? 'block' : 'hidden'
        )}
        aria-label="編集モードを終了"
      />

      {/* サイドバー */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full bg-background border-l border-border shadow-xl',
          'flex flex-col transition-transform duration-300 ease-out',
          'w-80 lg:w-72',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold">セクション編集</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleSidebar}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors lg:hidden"
              aria-label={isOpen ? '閉じる' : '開く'}
            >
              {isOpen ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="編集モードを終了"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto">
          {selectedSection ? (
            <>
              {/* 選択中セクションのヘッダー */}
              <SectionInspectorHeader
                title={selectedSection.title ?? sectionTypeLabels[selectedSection.type]}
                onClose={() => setSelectedSectionId(null)}
                className="sticky top-0 z-10"
              />
              {/* パネル */}
              {renderPanel(selectedSection)}
            </>
          ) : (
            <>
              {/* セクションリスト */}
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs text-muted-foreground">
                  編集するセクションを選択してください
                </p>
              </div>
              <SectionList
                sections={sections}
                selectedSectionId={null}
                onSelectSection={handleSelectSection}
              />
            </>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={handleClose}
            className="w-full px-4 py-2 text-sm font-medium text-center rounded-md border border-border hover:bg-muted/50 transition-colors"
          >
            編集を終了
          </button>
        </div>
      </aside>

      {/* トグルボタン（閉じているとき） */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleToggleSidebar}
          className="fixed top-1/2 right-0 z-50 -translate-y-1/2 p-2 bg-background border border-r-0 border-border rounded-l-md shadow-md hover:bg-muted/50 transition-colors"
          aria-label="サイドバーを開く"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      )}
    </>
  )
}
