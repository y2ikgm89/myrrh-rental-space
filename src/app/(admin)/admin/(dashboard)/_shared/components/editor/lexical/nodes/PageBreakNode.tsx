/**
 * Page Break Node
 *
 * @description ページ区切りを表示するDecoratorNode
 * 印刷時に改ページとして機能する
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from 'lexical'
import { $create, DecoratorNode } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, mergeRegister } from 'lexical'
import { useCallback, useEffect } from 'react'
import { Scissors } from 'lucide-react'

// =============================================================================
// Component
// =============================================================================

function PageBreakComponent({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)

  const $onDelete = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault()
      if (isSelected && $getNodeByKey(nodeKey)) {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node) {
            node.remove()
          }
        })
      }
      return false
    },
    [editor, isSelected, nodeKey]
  )

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          if (!(event.target instanceof HTMLElement)) return false
          const pageBreakElement = event.target.closest(`[data-lexical-page-break="${nodeKey}"]`)
          if (pageBreakElement) {
            clearSelection()
            setSelected(true)
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, nodeKey, clearSelection, setSelected, $onDelete])

  return (
    <div
      data-lexical-page-break={nodeKey}
      className={`relative my-8 py-4 cursor-pointer border-y-2 border-dashed flex items-center justify-center text-xs select-none ${
        isSelected
          ? 'border-primary text-primary'
          : 'border-muted-foreground/30 text-muted-foreground'
      }`}
    >
      <div className="flex items-center gap-2 bg-background px-3 py-1 rounded-full">
        <Scissors className="h-3 w-3" />
        <span>ページ区切り</span>
      </div>
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertPageBreakElement(element: HTMLElement): null | DOMConversionOutput {
  if (element.hasAttribute('data-page-break')) {
    return { node: $createPageBreakNode() }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class PageBreakNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('page-break', { extends: DecoratorNode })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      figure: (element: HTMLElement) => {
        if (element.hasAttribute('data-page-break')) {
          return {
            conversion: $convertPageBreakElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement('figure')
    element.setAttribute('data-page-break', 'true')
    const span = document.createElement('span')
    span.textContent = 'ページ区切り'
    element.appendChild(span)
    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    return div
  }

  override updateDOM(): false {
    return false
  }

  override getTextContent(): string {
    return '\n'
  }

  override isInline(): false {
    return false
  }

  override decorate(): ReactElement {
    return <PageBreakComponent nodeKey={this.__key} />
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * ページ区切りノードを作成する
 *
 * @returns PageBreakNode インスタンス
 */
export function $createPageBreakNode(): PageBreakNode {
  return $create(PageBreakNode)
}

/**
 * ノードがPageBreakNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns PageBreakNodeの場合true
 */
export function $isPageBreakNode(
  node: LexicalNode | null | undefined
): node is PageBreakNode {
  return node instanceof PageBreakNode
}
