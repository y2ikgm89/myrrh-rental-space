/**
 * Collapsible Inspector Panel
 *
 * @description CollapsibleContainerNodeのプロパティ編集パネル
 * 3-tier構造: Container → Item → Title + Content
 */

'use client'

import { $getNodeByKey, $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { SortableInspectorList, type SortableInspectorItem } from '../SortableInspectorList'
import {
  $isCollapsibleContainerNode,
  type CollapsibleContainerNode,
  COLLAPSIBLE_STYLES,
  COLLAPSIBLE_RADII,
  COLLAPSIBLE_TITLE_COLORS,
  collapsibleStyleState,
  borderRadiusState,
  titleColorState,
  titleCustomColorState,
  titleCustomLightState,
  isCollapsibleStyle,
  isCollapsibleRadius,
  isCollapsibleTitleColor,
} from '../../nodes/CollapsibleContainerNode'
import { $isCollapsibleItemNode } from '../../nodes/CollapsibleItemNode'
import { $isCollapsibleTitleNode } from '../../nodes/CollapsibleTitleNode'
import { $addCollapsibleItem, $removeCollapsibleItem, $reorderCollapsibleItem } from '../../plugins/CollapsiblePlugin'
import { COLLAPSIBLE_STYLE_LABELS, COLLAPSIBLE_RADIUS_LABELS, COLLAPSIBLE_TITLE_COLOR_LABELS } from '../../config/node-labels'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label, Input, Switch } from '@/admin/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'

const MAX_ITEMS = 10
const MIN_ITEMS = 1

type CollapsibleItemInfo = {
  key: string
  titleText: string
}

type CollapsibleInspectorPanelProps = {
  nodeKey: string
  node: CollapsibleContainerNode
}

export function CollapsibleInspectorPanel({ nodeKey, node }: CollapsibleInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isCollapsibleContainerNode)

  const { currentStyle, currentRadius, currentTitleColor, currentCustomColor, currentCustomLight, collapsibleItems } = editor.getEditorState().read(() => {
    const style = $getState(node, collapsibleStyleState)
    const radius = $getState(node, borderRadiusState)
    const tColor = $getState(node, titleColorState)
    const customColor = $getState(node, titleCustomColorState)
    const customLight = $getState(node, titleCustomLightState)
    const items: CollapsibleItemInfo[] = []
    const children = node.getChildren()

    for (const child of children) {
      if ($isCollapsibleItemNode(child)) {
        const titleNode = child.getChildren().find($isCollapsibleTitleNode)
        items.push({
          key: child.getKey(),
          titleText: titleNode ? titleNode.getTextContent() : '',
        })
      }
    }

    return {
      currentStyle: style,
      currentRadius: radius,
      currentTitleColor: tColor,
      currentCustomColor: customColor,
      currentCustomLight: customLight,
      collapsibleItems: items,
    }
  })

  const canRemove = collapsibleItems.length > MIN_ITEMS
  const canAdd = collapsibleItems.length < MAX_ITEMS

  const handleStyleChange = (value: string) => {
    if (isCollapsibleStyle(value)) {
      updateNode((n) => { $setState(n, collapsibleStyleState, value) })
    }
  }

  const handleRadiusChange = (value: string) => {
    if (isCollapsibleRadius(value)) {
      updateNode((n) => { $setState(n, borderRadiusState, value) })
    }
  }

  const handleTitleColorChange = (value: string) => {
    if (isCollapsibleTitleColor(value)) {
      updateNode((n) => { $setState(n, titleColorState, value) })
    }
  }

  const handleCustomColorChange = (color: string) => {
    updateNode((n) => { $setState(n, titleCustomColorState, color) })
  }

  const handleCustomLightChange = (checked: boolean) => {
    updateNode((n) => { $setState(n, titleCustomLightState, checked) })
  }

  const handleAddCollapsible = () => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey)
      if (!$isCollapsibleContainerNode(container)) return
      $addCollapsibleItem(container)
    })
  }

  const handleRemoveCollapsible = (id: string) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey)
      if (!$isCollapsibleContainerNode(container)) return
      const items = container.getChildren().filter($isCollapsibleItemNode)
      const index = items.findIndex((item) => item.getKey() === id)
      if (index !== -1) $removeCollapsibleItem(container, index)
    })
  }

  const handleReorderCollapsible = (fromIndex: number, toIndex: number) => {
    editor.update(() => {
      const container = $getNodeByKey(nodeKey)
      if (!$isCollapsibleContainerNode(container)) return
      $reorderCollapsibleItem(container, fromIndex, toIndex)
    })
  }

  const sortableItems: SortableInspectorItem[] = collapsibleItems.map((item) => ({
    id: item.key,
    label: item.titleText,
  }))

  return (
    <div>
      <InspectorHeader title="折りたたみ" />

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">種類</Label>
            <Select value={currentStyle} onValueChange={handleStyleChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLAPSIBLE_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {COLLAPSIBLE_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">角丸</Label>
            <Select value={currentRadius} onValueChange={handleRadiusChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLAPSIBLE_RADII.map((radius) => (
                  <SelectItem key={radius} value={radius}>
                    {COLLAPSIBLE_RADIUS_LABELS[radius]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">タイトル背景色</Label>
            <Select value={currentTitleColor} onValueChange={handleTitleColorChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLAPSIBLE_TITLE_COLORS.map((color) => (
                  <SelectItem key={color} value={color}>
                    {COLLAPSIBLE_TITLE_COLOR_LABELS[color]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {currentTitleColor === 'custom' && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">カスタムカラー</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={currentCustomColor}
                    onChange={(e) => handleCustomColorChange(e.target.value)}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={currentCustomColor}
                    onChange={(e) => {
                      const v = e.target.value
                      if (/^#[\da-f]{6}$/i.test(v)) handleCustomColorChange(v)
                    }}
                    className="h-8 font-mono text-xs"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">明るい背景（暗い文字）</Label>
                <Switch
                  checked={currentCustomLight}
                  onCheckedChange={handleCustomLightChange}
                />
              </div>
            </>
          )}
        </div>
      </InspectorSection>

      <InspectorSection title={`アイテム (${collapsibleItems.length})`}>
        <SortableInspectorList
          items={sortableItems}
          onReorder={handleReorderCollapsible}
          onRemove={handleRemoveCollapsible}
          onAdd={handleAddCollapsible}
          canAdd={canAdd}
          canRemove={canRemove}
          addLabel="折りたたみを追加"
          maxMessage="最大10個までです"
          minMessage="最低1つの折りたたみが必要です"
        />
      </InspectorSection>
    </div>
  )
}
