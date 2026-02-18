/**
 * Tabs Inspector Panel
 *
 * @description TabsContainerNodeのアイテム管理パネル
 */

'use client'

import { $getNodeByKey, $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { SortableInspectorList, type SortableInspectorItem } from '../SortableInspectorList'
import { $isTabsContainerNode, type TabsContainerNode, activeIndexState, TABS_STYLES, TABS_SIZES, TABS_FIXED_WIDTHS, isTabsStyle, isTabsSize, isTabsFixedWidth, tabsStyleState, tabsSizeState, tabsFixedWidthState, tabsColorState } from '../../nodes/TabsContainerNode'
import { type AccentColor } from '../../config/accent-colors'
import { $isTabListNode } from '../../nodes/TabListNode'
import { $isTabTitleNode } from '../../nodes/TabTitleNode'
import { $isTabPanelNode } from '../../nodes/TabPanelNode'
import { $addTab, $removeTab, $reorderTab, handleTabClick } from '../../plugins/TabsPlugin'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { ColorSwatchPicker } from '../ColorSwatchPicker'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label } from '@/admin/components/ui'
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
} from '../../config/node-labels'

const MAX_TABS = 8
const MIN_TABS = 2

type TabItemInfo = {
  key: string
  index: number
  titleText: string
}

type TabsInspectorPanelProps = {
  nodeKey: string
  node: TabsContainerNode
}

export function TabsInspectorPanel({ nodeKey, node }: TabsInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isTabsContainerNode)

  const { activeIndex, tabsStyle, tabsSize, tabsFixedWidth, tabsColor, tabItems } = editor.getEditorState().read(() => {
    const active = $getState(node, activeIndexState)
    const style = $getState(node, tabsStyleState)
    const size = $getState(node, tabsSizeState)
    const fixedWidth = $getState(node, tabsFixedWidthState)
    const color = $getState(node, tabsColorState)
    const children = node.getChildren()
    const tabList = children.find($isTabListNode)
    const items: TabItemInfo[] = []

    if (tabList) {
      const titles = tabList.getChildren().filter($isTabTitleNode)
      for (let i = 0; i < titles.length; i++) {
        const title = titles[i]
        if (!title) continue
        items.push({
          key: title.getKey(),
          index: i,
          titleText: title.getTextContent(),
        })
      }
    }

    return { activeIndex: active, tabsStyle: style, tabsSize: size, tabsFixedWidth: fixedWidth, tabsColor: color, tabItems: items }
  })

  const canRemove = tabItems.length > MIN_TABS
  const canAdd = tabItems.length < MAX_TABS

  const handleStyleChange = (value: string) => {
    if (isTabsStyle(value)) {
      updateNode((n) => { $setState(n, tabsStyleState, value) })
    }
  }

  const handleSizeChange = (value: string) => {
    if (isTabsSize(value)) {
      updateNode((n) => { $setState(n, tabsSizeState, value) })
    }
  }

  const handleFixedWidthChange = (value: string) => {
    if (isTabsFixedWidth(value)) {
      updateNode((n) => { $setState(n, tabsFixedWidthState, value) })
    }
  }

  const handleColorChange = (color: AccentColor) => {
    updateNode((n) => { $setState(n, tabsColorState, color) })
  }

  const handleAddTab = () => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey)
      if (!$isTabsContainerNode(container)) return
      const newPanel = $addTab(container)
      const newIndex = container.getChildren().filter($isTabPanelNode).length - 1
      handleTabClick(container, newIndex)
      const paragraph = newPanel.getChildAtIndex(0)
      if (paragraph) {
        paragraph.selectEnd()
      }
    })
  }

  const handleRemoveTab = (id: string) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey)
      if (!$isTabsContainerNode(container)) return
      const tabList = container.getChildren().find($isTabListNode)
      if (!tabList) return
      const titles = tabList.getChildren().filter($isTabTitleNode)
      const index = titles.findIndex((t) => t.getKey() === id)
      if (index !== -1) $removeTab(container, index)
    })
  }

  const handleReorderTab = (fromIndex: number, toIndex: number) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey)
      if (!$isTabsContainerNode(container)) return
      $reorderTab(container, fromIndex, toIndex)
    })
  }

  const sortableItems: SortableInspectorItem[] = tabItems.map((item) => ({
    id: item.key,
    label: item.titleText,
    isActive: item.index === activeIndex,
  }))

  return (
    <div>
      <InspectorHeader title="タブ" />

      <InspectorSection title="スタイル">
        <div className="space-y-2">
          <Label className="text-xs">表示スタイル</Label>
          <Select value={tabsStyle} onValueChange={handleStyleChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABS_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {TABS_STYLE_LABELS[style]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">タブ幅</Label>
          <Select value={tabsSize} onValueChange={handleSizeChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABS_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {TABS_SIZE_LABELS[size]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tabsSize === 'fixed' && (
          <div className="space-y-2">
            <Label className="text-xs">固定幅サイズ</Label>
            <Select value={tabsFixedWidth} onValueChange={handleFixedWidthChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TABS_FIXED_WIDTHS.map((w) => (
                  <SelectItem key={w} value={w}>
                    {TABS_FIXED_WIDTH_LABELS[w]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <ColorSwatchPicker
          value={tabsColor}
          onChange={handleColorChange}
          label="アクセントカラー"
        />
      </InspectorSection>

      <InspectorSection title={`アイテム (${tabItems.length})`}>
        <SortableInspectorList
          items={sortableItems}
          onReorder={handleReorderTab}
          onRemove={handleRemoveTab}
          onAdd={handleAddTab}
          canAdd={canAdd}
          canRemove={canRemove}
          addLabel="タブを追加"
          maxMessage="最大8タブまでです"
          minMessage="最低2つのタブが必要です"
        />
      </InspectorSection>
    </div>
  )
}
