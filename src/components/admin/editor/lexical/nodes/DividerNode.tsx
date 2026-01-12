/**
 * Divider Node
 *
 * 区切り線のカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <hr data-divider data-style="solid|dashed|dotted" />
 */

'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import { tv } from 'tailwind-variants'
import { Trash2, ChevronDown } from 'lucide-react'

export type DividerStyle = 'solid' | 'dashed' | 'dotted'

export type SerializedDividerNode = Spread<
  {
    dividerStyle: DividerStyle
  },
  SerializedLexicalNode
>

function $convertDividerElement(domNode: HTMLElement): DOMConversionOutput | null {
  const style = (domNode.getAttribute('data-style') as DividerStyle) || 'solid'
  const node = $createDividerNode(style)
  return { node }
}

const styles = tv({
  slots: {
    wrapper: 'relative my-6 group',
    line: 'w-full border-t-2',
    actions: [
      'absolute -top-3 left-1/2 -translate-x-1/2',
      'flex items-center gap-1 bg-background px-2 py-1 rounded-md border',
      'opacity-0 group-hover:opacity-100 transition-opacity',
      'shadow-sm',
    ],
    styleButton: [
      'flex items-center gap-1 px-2 py-0.5 text-xs rounded',
      'hover:bg-muted transition-colors cursor-pointer',
    ],
    dropdown: 'absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 py-1',
    dropdownItem: 'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted',
    actionButton: 'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
  },
  variants: {
    dividerStyle: {
      solid: { line: 'border-solid border-border' },
      dashed: { line: 'border-dashed border-border' },
      dotted: { line: 'border-dotted border-border' },
    },
    selected: {
      true: { wrapper: 'ring-2 ring-primary ring-offset-4 rounded' },
    },
  },
})()

const STYLE_LABELS: Record<DividerStyle, string> = {
  solid: '実線',
  dashed: '破線',
  dotted: '点線',
}

// Inline component for DividerNode
function DividerComponent({
  nodeKey,
  dividerStyle,
}: {
  nodeKey: string
  dividerStyle: DividerStyle
}) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [showStyleDropdown, setShowStyleDropdown] = useState(false)

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isDividerNode(node)) {
            node.remove()
          }
        })
        return true
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
          const dividerWrapper = target.closest('.divider-wrapper')
          if (dividerWrapper) {
            clearSelection()
            setSelected(true)
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW)
    )
  }, [clearSelection, editor, onDelete, setSelected])

  const handleStyleChange = useCallback(
    (newStyle: DividerStyle) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isDividerNode(node)) {
          node.setDividerStyle(newStyle)
        }
      })
      setShowStyleDropdown(false)
    },
    [editor, nodeKey]
  )

  const handleRemove = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isDividerNode(node)) {
        node.remove()
      }
    })
  }, [editor, nodeKey])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showStyleDropdown) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.style-dropdown')) {
        setShowStyleDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showStyleDropdown])

  return (
    <div className={`divider-wrapper ${styles.wrapper({ selected: isSelected })}`}>
      <hr className={styles.line({ dividerStyle })} />
      <div className={styles.actions()}>
        <div className="style-dropdown relative">
          <button
            type="button"
            className={styles.styleButton()}
            onClick={() => setShowStyleDropdown(!showStyleDropdown)}
          >
            <span>{STYLE_LABELS[dividerStyle]}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showStyleDropdown && (
            <div className={styles.dropdown()}>
              {(Object.keys(STYLE_LABELS) as DividerStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={styles.dropdownItem()}
                  onClick={() => handleStyleChange(style)}
                >
                  <span
                    className={`w-8 border-t-2 ${
                      style === 'solid'
                        ? 'border-solid'
                        : style === 'dashed'
                          ? 'border-dashed'
                          : 'border-dotted'
                    } border-current`}
                  />
                  <span>{STYLE_LABELS[style]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.actionButton()}
          onClick={handleRemove}
          aria-label="削除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

export class DividerNode extends DecoratorNode<ReactElement> {
  __dividerStyle: DividerStyle

  static getType(): string {
    return 'divider'
  }

  static clone(node: DividerNode): DividerNode {
    return new DividerNode(node.__dividerStyle, node.__key)
  }

  constructor(dividerStyle: DividerStyle = 'solid', key?: NodeKey) {
    super(key)
    this.__dividerStyle = dividerStyle
  }

  static importJSON(serializedNode: SerializedDividerNode): DividerNode {
    return $createDividerNode(serializedNode.dividerStyle).updateFromJSON(
      serializedNode
    )
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedDividerNode>
  ): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedDividerNode {
    return {
      ...super.exportJSON(),
      dividerStyle: this.__dividerStyle,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-divider')) {
          return null
        }
        return {
          conversion: $convertDividerElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('hr')
    element.setAttribute('data-divider', '')
    element.setAttribute('data-style', this.__dividerStyle)
    return { element }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'divider-node-wrapper'
    return div
  }

  updateDOM(): false {
    return false
  }

  getDividerStyle(): DividerStyle {
    return this.__dividerStyle
  }

  setDividerStyle(style: DividerStyle): void {
    const writable = this.getWritable()
    writable.__dividerStyle = style
  }

  decorate(): ReactElement {
    return (
      <DividerComponent nodeKey={this.__key} dividerStyle={this.__dividerStyle} />
    )
  }
}

export function $createDividerNode(
  dividerStyle: DividerStyle = 'solid'
): DividerNode {
  return $applyNodeReplacement(new DividerNode(dividerStyle))
}

export function $isDividerNode(
  node: LexicalNode | null | undefined
): node is DividerNode {
  return node instanceof DividerNode
}
