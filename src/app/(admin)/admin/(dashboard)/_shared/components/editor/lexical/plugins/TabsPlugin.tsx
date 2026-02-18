/**
 * Tabs Plugin
 *
 * @description タブ切り替えUIの挿入を提供するプラグイン
 *
 * ダイアログでスタイルとカラーを選択し、2タブのTabs構造を挿入
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $getState,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  mergeRegister,
} from 'lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import {
  $createTabsContainerNode,
  $isTabsContainerNode,
  TabsContainerNode,
  activeIndexState,
  TABS_STYLES,
  TABS_SIZES,
  TABS_FIXED_WIDTHS,
  isTabsStyle,
  isTabsSize,
  isTabsFixedWidth,
  type TabsStyle,
  type TabsSize,
  type TabsFixedWidth,
} from '../nodes/TabsContainerNode'
import { $createTabListNode, TabListNode, $isTabListNode } from '../nodes/TabListNode'
import { $createTabTitleNode, TabTitleNode, $isTabTitleNode, tabTitleIndexState, tabTitleActiveState } from '../nodes/TabTitleNode'
import { $createTabPanelNode, TabPanelNode, $isTabPanelNode, tabPanelIndexState, tabPanelActiveState } from '../nodes/TabPanelNode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
} from '@/admin/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import {
  TABS_STYLE_LABELS,
  TABS_SIZE_LABELS,
  TABS_FIXED_WIDTH_LABELS,
} from '../config/node-labels'

// =============================================================================
// Preview
// =============================================================================

// TabTitleNode と同じベースクラスを使い、lexical-content.css がスタイルを上書き
const TAB_BASE_CLASS = 'px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer select-none'
const TAB_ACTIVE_CLASS = 'border-primary text-foreground bg-background'
const TAB_INACTIVE_CLASS = 'border-transparent text-muted-foreground'
const TAB_LIST_CLASS = 'flex border-b bg-muted/50'

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでTabs境界を脱出
 */
function $onEscape(direction: 'up' | 'down'): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.anchor.getNode()
  let tabsNode: TabsContainerNode | null = null
  let current = node.getParent()

  while (current) {
    if ($isTabsContainerNode(current)) {
      tabsNode = current
      break
    }
    current = current.getParent()
  }

  if (!tabsNode) return false

  const isAtStart = selection.anchor.offset === 0
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize()

  if ((direction === 'up' && isAtStart) || (direction === 'down' && isAtEnd)) {
    const paragraph = $createParagraphNode()
    if (direction === 'up') {
      tabsNode.insertBefore(paragraph)
    } else {
      tabsNode.insertAfter(paragraph)
    }
    paragraph.select()
    return true
  }

  return false
}

/**
 * タブをクリックしてアクティブ状態を切り替える
 */
export function handleTabClick(
  tabsContainer: TabsContainerNode,
  clickedIndex: number
): void {
  const children = tabsContainer.getChildren()
  const tabList = children.find($isTabListNode)
  const panels = children.filter($isTabPanelNode)

  // タブタイトルのアクティブ状態を更新
  if (tabList) {
    const titles = tabList.getChildren().filter($isTabTitleNode)
    for (const title of titles) {
      $setState(title, tabTitleActiveState, $getState(title, tabTitleIndexState) === clickedIndex)
    }
  }

  // パネルのアクティブ状態を更新
  for (const panel of panels) {
    $setState(panel, tabPanelActiveState, $getState(panel, tabPanelIndexState) === clickedIndex)
  }

  // コンテナのactiveIndexを更新
  $setState(tabsContainer, activeIndexState, clickedIndex)
}

/**
 * 全TabTitle/TabPanelのindexとisActiveを再設定
 */
export function $reindexTabs(container: TabsContainerNode, newActiveIndex?: number): void {
  const children = container.getChildren()
  const tabList = children.find($isTabListNode)
  const panels = children.filter($isTabPanelNode)
  const current = $getState(container, activeIndexState)
  const maxIdx = Math.max(0, panels.length - 1)
  const activeIdx = newActiveIndex !== undefined
    ? Math.min(newActiveIndex, maxIdx)
    : Math.min(current, maxIdx)

  if (tabList) {
    const titles = tabList.getChildren().filter($isTabTitleNode)
    for (let i = 0; i < titles.length; i++) {
      const t = titles[i]
      if (!t) continue
      $setState(t, tabTitleIndexState, i)
      $setState(t, tabTitleActiveState, i === activeIdx)
    }
  }
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i]
    if (!p) continue
    $setState(p, tabPanelIndexState, i)
    $setState(p, tabPanelActiveState, i === activeIdx)
  }
  $setState(container, activeIndexState, activeIdx)
}

/**
 * 末尾にタブを追加し、新規TabPanelNodeを返す
 */
export function $addTab(container: TabsContainerNode): TabPanelNode {
  const children = container.getChildren()
  const tabList = children.find($isTabListNode)
  const panelCount = children.filter($isTabPanelNode).length
  const newIndex = panelCount

  if (tabList) {
    const title = $createTabTitleNode(newIndex, false)
    const titleParagraph = $createParagraphNode()
    titleParagraph.append($createTextNode(`タブ${newIndex + 1}`))
    title.append(titleParagraph)
    tabList.append(title)
  }

  const panel = $createTabPanelNode(newIndex, false)
  const panelParagraph = $createParagraphNode()
  panelParagraph.append($createTextNode(`タブ${newIndex + 1}のコンテンツを入力`))
  panel.append(panelParagraph)
  container.append(panel)

  $reindexTabs(container)
  return panel
}

/**
 * 0-based indexでタブを削除。最小2つ保証
 */
export function $removeTab(container: TabsContainerNode, index: number): boolean {
  const children = container.getChildren()
  const tabList = children.find($isTabListNode)
  const panels = children.filter($isTabPanelNode)
  if (panels.length <= 2) return false

  if (tabList) {
    const titles = tabList.getChildren().filter($isTabTitleNode)
    titles[index]?.remove()
  }
  const targetPanel = panels[index]
  if (!targetPanel) return false
  targetPanel.remove()

  const currentActive = $getState(container, activeIndexState)
  const newActive = index <= currentActive
    ? Math.max(0, currentActive - 1)
    : currentActive
  $reindexTabs(container, newActive)
  return true
}

export function $reorderTab(
  container: TabsContainerNode,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) return
  const children = container.getChildren()
  const tabList = children.find($isTabListNode)
  const panels = children.filter($isTabPanelNode)
  if (!tabList) return

  const titles = tabList.getChildren().filter($isTabTitleNode)
  const movedTitle = titles[fromIndex]
  const targetTitle = titles[toIndex]
  const movedPanel = panels[fromIndex]
  const targetPanel = panels[toIndex]
  if (!movedTitle || !targetTitle || !movedPanel || !targetPanel) return

  if (fromIndex < toIndex) {
    targetTitle.insertAfter(movedTitle)
    targetPanel.insertAfter(movedPanel)
  } else {
    targetTitle.insertBefore(movedTitle)
    targetPanel.insertBefore(movedPanel)
  }

  // アクティブインデックスを追従
  const currentActive = $getState(container, activeIndexState)
  let newActive = currentActive
  if (currentActive === fromIndex) {
    newActive = toIndex
  } else if (fromIndex < toIndex) {
    if (currentActive > fromIndex && currentActive <= toIndex) newActive = currentActive - 1
  } else {
    if (currentActive >= toIndex && currentActive < fromIndex) newActive = currentActive + 1
  }

  $reindexTabs(container, newActive)
}

// =============================================================================
// Types
// =============================================================================

type TabsPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function TabsPlugin({ isOpen, onClose }: TabsPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedStyle, setSelectedStyle] = useState<TabsStyle>('underline')
  const [selectedSize, setSelectedSize] = useState<TabsSize>('auto')
  const [selectedFixedWidth, setSelectedFixedWidth] = useState<TabsFixedWidth>('120')

  // リスナー登録（mergeRegisterで統一）
  useEffect(() => {
    // タブクリックイベントリスナー
    const rootElement = editor.getRootElement()

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const tabElement = target.closest('[role="tab"]')
      if (!tabElement) return

      const tabIndexAttr = tabElement.getAttribute('data-tab-index')
      if (tabIndexAttr === null) return

      const clickedIndex = parseInt(tabIndexAttr, 10)

      editor.update(() => {
        // TabTitleNodeを探す
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return

        const node = selection.anchor.getNode()
        let current = node.getParent()

        // TabsContainerを探す
        while (current) {
          if ($isTabsContainerNode(current)) {
            handleTabClick(current, clickedIndex)
            break
          }
          current = current.getParent()
        }
      })
    }

    if (rootElement) {
      rootElement.addEventListener('click', handleClick)
    }

    const unregister = mergeRegister(
      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape('up'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape('down'),
        COMMAND_PRIORITY_LOW
      ),
      // 構造検証トランスフォーマー: TabsContainer
      editor.registerNodeTransform(TabsContainerNode, (node) => {
        const children = node.getChildren()
        const hasTabList = children.some($isTabListNode)

        // TabListがなければ追加
        if (!hasTabList) {
          const tabList = $createTabListNode()
          const title = $createTabTitleNode(0, true)
          const titleParagraph = $createParagraphNode()
          titleParagraph.append($createTextNode('タブ1'))
          title.append(titleParagraph)
          tabList.append(title)
          node.append(tabList)
        }

        // TabPanelがなければ追加
        const panels = children.filter($isTabPanelNode)
        if (panels.length === 0) {
          const panel = $createTabPanelNode(0, true)
          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode('コンテンツを入力'))
          panel.append(paragraph)
          node.append(panel)
        }
      }),
      // TabListNodeの構造検証
      editor.registerNodeTransform(TabListNode, (node) => {
        const children = node.getChildren()
        if (children.length === 0) {
          const title = $createTabTitleNode(0, true)
          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode('タブ1'))
          title.append(paragraph)
          node.append(title)
        }
      }),
      // TabTitleNodeの構造検証
      editor.registerNodeTransform(TabTitleNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      }),
      // TabPanelNodeの構造検証
      editor.registerNodeTransform(TabPanelNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      })
    )

    return () => {
      unregister()
      if (rootElement) {
        rootElement.removeEventListener('click', handleClick)
      }
    }
  }, [editor])

  const resetForm = () => {
    setSelectedStyle('underline')
    setSelectedSize('auto')
    setSelectedFixedWidth('120')
  }

  const handleInsert = () => {
    const count = 2

    editor.update(() => {
      const tabsContainer = $createTabsContainerNode(0, selectedStyle, selectedSize, selectedFixedWidth)

      // タブリストを作成
      const tabList = $createTabListNode()
      for (let i = 0; i < count; i++) {
        const title = $createTabTitleNode(i, i === 0)
        const titleParagraph = $createParagraphNode()
        titleParagraph.append($createTextNode(`タブ${i + 1}`))
        title.append(titleParagraph)
        tabList.append(title)
      }
      tabsContainer.append(tabList)

      // タブパネルを作成
      for (let i = 0; i < count; i++) {
        const panel = $createTabPanelNode(i, i === 0)
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode(`タブ${i + 1}のコンテンツを入力`))
        panel.append(paragraph)
        tabsContainer.append(panel)
      }

      $insertNodeToNearestRoot(tabsContainer)

      // 最初のタブのコンテンツを選択
      const panels = tabsContainer.getChildren().filter($isTabPanelNode)
      const firstPanel = panels[0]
      if (firstPanel) {
        const paragraph = firstPanel.getChildAtIndex(0)
        if (paragraph) {
          paragraph.selectEnd()
        }
      }
    })

    resetForm()
    onClose()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>タブを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">スタイル</Label>
              <Select value={selectedStyle} onValueChange={(v) => isTabsStyle(v) && setSelectedStyle(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TABS_STYLES.map((s) => (
                    <SelectItem key={s} value={s}>{TABS_STYLE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">タブ幅</Label>
              <Select value={selectedSize} onValueChange={(v) => isTabsSize(v) && setSelectedSize(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TABS_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{TABS_SIZE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSize === 'fixed' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">固定幅サイズ</Label>
                <Select value={selectedFixedWidth} onValueChange={(v) => isTabsFixedWidth(v) && setSelectedFixedWidth(v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TABS_FIXED_WIDTHS.map((w) => (
                      <SelectItem key={w} value={w}>{TABS_FIXED_WIDTH_LABELS[w]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>

          {/* プレビュー — エディタと同じ data 属性 + role で lexical-content.css を適用 */}
          <div
            className="my-0 border rounded-lg overflow-hidden"
            data-tabs-container="true"
            data-tabs-style={selectedStyle}
            data-tabs-size={selectedSize}
            data-tabs-fixed-width={selectedFixedWidth}
            data-tabs-active="0"
          >
            <div role="tablist" className={TAB_LIST_CLASS}>
              {Array.from({ length: 2 }, (_, i) => (
                <div
                  key={i}
                  role="tab"
                  aria-selected={i === 0}
                  className={`${TAB_BASE_CLASS} ${i === 0 ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
                >
                  タブ{i + 1}
                </div>
              ))}
            </div>
            <div role="tabpanel" className="p-4 text-sm text-muted-foreground">
              タブ1のコンテンツ
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
