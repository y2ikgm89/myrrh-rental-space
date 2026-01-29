/**
 * Tabs Plugin
 *
 * @description タブ切り替えUIの挿入を提供するプラグイン
 *
 * ダイアログでタブ数を選択し、Tabs構造を挿入
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
} from 'lexical'
import {
  $createTabsContainerNode,
  $isTabsContainerNode,
  TabsContainerNode,
} from '../nodes/TabsContainerNode'
import { $createTabListNode, TabListNode, $isTabListNode } from '../nodes/TabListNode'
import { $createTabTitleNode, TabTitleNode, $isTabTitleNode } from '../nodes/TabTitleNode'
import { $createTabPanelNode, TabPanelNode, $isTabPanelNode } from '../nodes/TabPanelNode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
  SelectionBox,
} from '@/admin/components/ui'

// =============================================================================
// Options
// =============================================================================

const TAB_COUNT_OPTIONS = [
  { value: '2', label: '2', description: '2タブ' },
  { value: '3', label: '3', description: '3タブ' },
  { value: '4', label: '4', description: '4タブ' },
  { value: '5', label: '5', description: '5タブ' },
]

// =============================================================================
// Hook
// =============================================================================

export function useTabsDialog() {
  const [isTabsDialogOpen, setIsTabsDialogOpen] = useState(false)

  const openTabsDialog = useCallback(() => setIsTabsDialogOpen(true), [])
  const closeTabsDialog = useCallback(() => setIsTabsDialogOpen(false), [])

  return {
    isTabsDialogOpen,
    openTabsDialog,
    closeTabsDialog,
  }
}

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
function handleTabClick(
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
      title.setIsActive(title.getTabIndex() === clickedIndex)
    }
  }

  // パネルのアクティブ状態を更新
  for (const panel of panels) {
    panel.setIsActive(panel.getTabIndex() === clickedIndex)
  }

  // コンテナのactiveIndexを更新
  tabsContainer.setActiveIndex(clickedIndex)
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
  const [tabCount, setTabCount] = useState('3')

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

  const resetForm = useCallback(() => {
    setTabCount('3')
  }, [])

  const handleInsert = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      const count = parseInt(tabCount, 10)
      const tabsContainer = $createTabsContainerNode(0)

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

      selection.insertNodes([tabsContainer])

      // 最初のタブのコンテンツを選択
      const panels = tabsContainer.getChildren().filter($isTabPanelNode)
      if (panels.length > 0) {
        const firstPanel = panels[0]
        const paragraph = firstPanel.getChildAtIndex(0)
        if (paragraph) {
          paragraph.selectEnd()
        }
      }
    })

    resetForm()
    onClose()
  }, [editor, tabCount, resetForm, onClose])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>タブを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* タブ数選択 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">タブ数</Label>
            <SelectionBox
              options={TAB_COUNT_OPTIONS}
              value={tabCount}
              onChange={setTabCount}
              columns={2}
              name="タブ数"
            />
          </div>

          {/* プレビュー */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex border-b bg-muted/50">
              {Array.from({ length: parseInt(tabCount, 10) }, (_, i) => (
                <div
                  key={i}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                    i === 0
                      ? 'border-primary text-primary bg-background'
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  タブ{i + 1}
                </div>
              ))}
            </div>
            <div className="p-4 text-sm text-muted-foreground">
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
