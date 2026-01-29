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
  SerializedLexicalNode,
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND } from 'lexical'
import { useCallback, useEffect } from 'react'
import { mergeRegister } from '@lexical/utils'
import { Scissors } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

export type SerializedPageBreakNode = SerializedLexicalNode

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
          const target = event.target as HTMLElement
          const pageBreakElement = target.closest(`[data-lexical-page-break="${nodeKey}"]`)
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

function $convertPageBreakElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  if (element.hasAttribute('data-page-break')) {
    return { node: $createPageBreakNode() }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class PageBreakNode extends DecoratorNode<ReactElement> {
  static getType(): string {
    return 'page-break'
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__key)
  }

  static importJSON(_serializedNode: SerializedPageBreakNode): PageBreakNode {
    return $createPageBreakNode()
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figure: (domNode: Node) => {
        const element = domNode as HTMLElement
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

  constructor(key?: NodeKey) {
    super(key)
  }

  exportJSON(): SerializedPageBreakNode {
    return {
      ...super.exportJSON(),
      type: 'page-break',
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('figure')
    element.setAttribute('data-page-break', 'true')
    element.style.cssText = 'page-break-after: always; break-after: page;'
    element.className = 'my-8 py-4 border-y-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground'
    // Safe DOM construction
    const span = document.createElement('span')
    span.className = 'bg-background px-3 py-1'
    span.textContent = 'ページ区切り'
    element.appendChild(span)
    return { element }
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    return div
  }

  updateDOM(): false {
    return false
  }

  getTextContent(): string {
    return '\n'
  }

  isInline(): false {
    return false
  }

  decorate(): ReactElement {
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
  return $applyNodeReplacement(new PageBreakNode())
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
