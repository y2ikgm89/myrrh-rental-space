'use client'

/**
 * GenericSidePanel
 *
 * 統一エディターサイドパネル
 * 全エディター(Blog/News/Page)で共通利用
 */

import { tv } from 'tailwind-variants'
import { X } from 'lucide-react'
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/admin/ui'
import { Z_INDEX } from '@/lib/styles/z-index'
import type { GenericSidePanelProps, PanelWidth } from '@/types/editor-panel'

const PANEL_WIDTH_MAP: Record<PanelWidth, string> = {
  sm: 'w-80', // 320px
  md: 'w-96', // 384px
  lg: 'w-[420px]', // 420px
}

const styles = tv({
  slots: {
    overlay: [
      'fixed inset-0 bg-black/20 backdrop-blur-sm',
      'transition-opacity duration-300',
      'lg:hidden',
    ],
    panel: [
      'fixed right-0 top-0 h-full bg-background',
      'border-l shadow-2xl',
      'transform transition-all duration-300 ease-out',
      'flex flex-col',
    ],
    header: 'flex items-center justify-between border-b px-4 py-3',
    title: 'text-lg font-semibold',
    content: 'flex-1 overflow-y-auto p-4',
    tabsList: 'w-full',
    tabContent: 'mt-4',
  },
  variants: {
    isOpen: {
      true: {
        overlay: 'opacity-100',
        panel: 'translate-x-0',
      },
      false: {
        overlay: 'opacity-0 pointer-events-none',
        panel: 'translate-x-full',
      },
    },
  },
})

export function GenericSidePanel({
  isOpen,
  onClose,
  title,
  width = 'md',
  tabs,
  defaultTab,
  renderTabContent,
  disabled = false,
  className,
}: GenericSidePanelProps) {
  const classes = styles({ isOpen })
  const widthClass = PANEL_WIDTH_MAP[width]

  // タブが1つの場合はタブUIを表示しない
  const showTabs = tabs.length > 1

  return (
    <>
      {/* オーバーレイ */}
      <div
        className={classes.overlay()}
        style={{ zIndex: Z_INDEX.overlay }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* パネル */}
      <aside
        className={`${classes.panel()} ${widthClass} w-full sm:${widthClass} ${className || ''}`}
        style={{ zIndex: Z_INDEX.editorSidePanel }}
        aria-label={title}
      >
        {/* ヘッダー */}
        <div className={classes.header()}>
          <h2 className={classes.title()}>{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">閉じる</span>
          </Button>
        </div>

        {/* コンテンツ */}
        <div className={classes.content()}>
          {showTabs ? (
            <Tabs defaultValue={defaultTab || tabs[0]?.id} className="w-full">
              <TabsList className={classes.tabsList()}>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} disabled={disabled}>
                    {tab.icon && <span className="mr-2">{tab.icon}</span>}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {tabs.map((tab) => (
                <TabsContent
                  key={tab.id}
                  value={tab.id}
                  className={classes.tabContent()}
                >
                  {renderTabContent(tab.id)}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            // シングルタブの場合
            <div>{renderTabContent(tabs[0]?.id || 'default')}</div>
          )}
        </div>
      </aside>
    </>
  )
}
