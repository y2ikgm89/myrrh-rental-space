/**
 * Layout Inspector Panel
 *
 * @description LayoutContainerNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isLayoutContainerNode, type LayoutContainerNode, templateColumnsState } from '../../nodes/LayoutContainerNode'
import { InspectorHeader } from '../InspectorHeader'
import { InspectorFields } from '../InspectorFields'
import { useNodeUpdater } from '../hooks/use-node-updater'
import { Label } from '@/admin/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'

const LAYOUT_TEMPLATES = [
  { value: '1fr 1fr', label: '2カラム（均等）' },
  { value: '1fr 2fr', label: '2カラム（1:2）' },
  { value: '2fr 1fr', label: '2カラム（2:1）' },
  { value: '1fr 1fr 1fr', label: '3カラム（均等）' },
  { value: '1fr 1fr 1fr 1fr', label: '4カラム（均等）' },
] as const

type LayoutInspectorPanelProps = {
  nodeKey: string
  node: LayoutContainerNode
}

export function LayoutInspectorPanel({ nodeKey, node }: LayoutInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isLayoutContainerNode)

  const templateColumns = editor.getEditorState().read(() => $getState(node, templateColumnsState))

  const handleTemplateChange = (value: string) => {
    updateNode((n) => { $setState(n, templateColumnsState, value) })
  }

  return (
    <div>
      <InspectorHeader title="カラムレイアウト" />

      <InspectorFields title="レイアウト">
          <div className="space-y-2">
            <Label className="text-xs">カラム配置</Label>
            <Select value={templateColumns} onValueChange={handleTemplateChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUT_TEMPLATES.map((template) => (
                  <SelectItem key={template.value} value={template.value}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">grid-template-columns</Label>
            <p className="text-xs text-muted-foreground font-mono">{templateColumns}</p>
          </div>
      </InspectorFields>
    </div>
  )
}
