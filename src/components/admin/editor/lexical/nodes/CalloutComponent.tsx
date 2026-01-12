/**
 * Callout Component
 *
 * エディタ内でコールアウト/アラートボックスを表示・編集するコンポーネント
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { tv } from 'tailwind-variants'
import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { $isCalloutNode, type CalloutType } from './CalloutNode'

const styles = tv({
  slots: {
    wrapper: 'relative rounded-lg border-2 p-4 transition-colors',
    header: 'flex items-center justify-between mb-2',
    iconWrapper: 'flex items-center gap-2',
    icon: 'w-5 h-5',
    typeSelector: 'relative',
    typeSelectorButton: [
      'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
      'hover:bg-black/5 transition-colors cursor-pointer',
    ],
    dropdown: 'absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 py-1 min-w-[120px]',
    dropdownItem: [
      'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer',
      'hover:bg-muted transition-colors',
    ],
    actions: 'flex items-center gap-1',
    actionButton: [
      'p-1.5 rounded-md transition-colors',
      'hover:bg-black/10 text-muted-foreground hover:text-foreground',
    ],
    textarea: [
      'w-full bg-transparent border-none outline-none resize-none',
      'text-sm leading-relaxed placeholder:text-current placeholder:opacity-50',
    ],
  },
  variants: {
    calloutType: {
      info: {
        wrapper: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
        icon: 'text-blue-600 dark:text-blue-400',
        textarea: 'text-blue-900 dark:text-blue-100',
      },
      warning: {
        wrapper: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
        icon: 'text-amber-600 dark:text-amber-400',
        textarea: 'text-amber-900 dark:text-amber-100',
      },
      error: {
        wrapper: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
        icon: 'text-red-600 dark:text-red-400',
        textarea: 'text-red-900 dark:text-red-100',
      },
      success: {
        wrapper: 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
        icon: 'text-green-600 dark:text-green-400',
        textarea: 'text-green-900 dark:text-green-100',
      },
    },
    selected: {
      true: {
        wrapper: 'ring-2 ring-primary/50',
      },
    },
  },
})()

type CalloutComponentProps = {
  nodeKey: string
  calloutType: CalloutType
  content: string
}

const CALLOUT_CONFIG: Record<
  CalloutType,
  { icon: typeof Info; label: string }
> = {
  info: { icon: Info, label: '情報' },
  warning: { icon: AlertTriangle, label: '警告' },
  error: { icon: XCircle, label: 'エラー' },
  success: { icon: CheckCircle, label: '成功' },
}

export function CalloutComponent({
  nodeKey,
  calloutType,
  content,
}: CalloutComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [localContent, setLocalContent] = useState(content)

  const Icon = CALLOUT_CONFIG[calloutType].icon

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isCalloutNode(node)) {
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
          const calloutWrapper = target.closest('.callout-wrapper')
          if (calloutWrapper) {
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
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
  }, [clearSelection, editor, onDelete, setSelected])

  const handleTypeChange = useCallback(
    (newType: CalloutType) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isCalloutNode(node)) {
          node.setCalloutType(newType)
        }
      })
      setShowTypeDropdown(false)
    },
    [editor, nodeKey]
  )

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value
      setLocalContent(newContent)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isCalloutNode(node)) {
          node.setContent(newContent)
        }
      })
    },
    [editor, nodeKey]
  )

  const handleRemove = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCalloutNode(node)) {
        node.remove()
      }
    })
  }, [editor, nodeKey])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showTypeDropdown) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.type-selector')) {
        setShowTypeDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showTypeDropdown])

  return (
    <div
      className={styles.wrapper({ calloutType, selected: isSelected })}
    >
      <div className={styles.header()}>
        <div className={styles.iconWrapper()}>
          <Icon className={styles.icon({ calloutType })} />
          <div className={`type-selector ${styles.typeSelector()}`}>
            <button
              type="button"
              className={styles.typeSelectorButton()}
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            >
              <span>{CALLOUT_CONFIG[calloutType].label}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showTypeDropdown && (
              <div className={styles.dropdown()}>
                {(Object.keys(CALLOUT_CONFIG) as CalloutType[]).map((type) => {
                  const config = CALLOUT_CONFIG[type]
                  const TypeIcon = config.icon
                  return (
                    <button
                      key={type}
                      type="button"
                      className={styles.dropdownItem()}
                      onClick={() => handleTypeChange(type)}
                    >
                      <TypeIcon className="w-4 h-4" />
                      <span>{config.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div className={styles.actions()}>
          <button
            type="button"
            className={styles.actionButton()}
            onClick={handleRemove}
            aria-label="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <textarea
        className={styles.textarea({ calloutType })}
        value={localContent}
        onChange={handleContentChange}
        placeholder="ここにテキストを入力..."
        rows={2}
      />
    </div>
  )
}
