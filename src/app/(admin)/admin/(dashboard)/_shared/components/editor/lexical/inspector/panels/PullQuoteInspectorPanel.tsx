/**
 * PullQuote Inspector Panel
 *
 * @description PullQuoteNodeのプロパティ編集パネル
 */

'use client'

import { $getState, $setState } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isPullQuoteNode, type PullQuoteNode, PULL_QUOTE_STYLES, isPullQuoteStyle, quoteStyleState } from '../../nodes/PullQuoteNode'
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
import { PULL_QUOTE_STYLE_LABELS } from '../../config/node-labels'

type PullQuoteInspectorPanelProps = {
  nodeKey: string
  node: PullQuoteNode
}

export function PullQuoteInspectorPanel({ nodeKey, node }: PullQuoteInspectorPanelProps) {
  const [editor] = useLexicalComposerContext()
  const updateNode = useNodeUpdater(nodeKey, $isPullQuoteNode)

  const quoteStyle = editor.getEditorState().read(() => $getState(node, quoteStyleState))

  const handleStyleChange = (value: string) => {
    if (isPullQuoteStyle(value)) {
      updateNode((n) => { $setState(n, quoteStyleState, value) })
    }
  }

  return (
    <div>
      <InspectorHeader title="プルクォート" />

      <InspectorFields title="スタイル">
          <div className="space-y-2">
            <Label className="text-xs">表示スタイル</Label>
            <Select value={quoteStyle} onValueChange={handleStyleChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PULL_QUOTE_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {PULL_QUOTE_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
      </InspectorFields>
    </div>
  )
}
