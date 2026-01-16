/**
 * Callout Plugin
 *
 * コールアウト/アラートボックスの挿入機能
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $insertNodes,
  $isRootOrShadowRoot,
  $createParagraphNode,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from 'lexical'
import { $wrapNodeInElement, mergeRegister } from '@lexical/utils'
import { tv } from 'tailwind-variants'
import { X, Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'
import { $createCalloutNode, CalloutNode, type CalloutType } from '../nodes/CalloutNode'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-md',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    typeGrid: 'grid grid-cols-2 gap-2',
    typeButton: [
      'flex items-center gap-2 p-3 rounded-lg border-2 transition-colors',
      'hover:border-primary/50 cursor-pointer',
    ],
    typeButtonActive: 'border-primary bg-primary/10',
    typeButtonInactive: 'border-border',
    typeIcon: 'w-5 h-5',
    typeLabel: 'text-sm font-medium',
    textarea: 'w-full px-3 py-2 border rounded-md bg-background text-sm min-h-[80px] resize-none',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_CALLOUT_COMMAND: LexicalCommand<{
  calloutType: CalloutType
  content: string
}> = createCommand('INSERT_CALLOUT_COMMAND')

type CalloutDialogProps = {
  isOpen: boolean
  onClose: () => void
}

const CALLOUT_TYPES: { type: CalloutType; icon: typeof Info; label: string; color: string }[] = [
  { type: 'info', icon: Info, label: '情報', color: 'text-blue-600' },
  { type: 'warning', icon: AlertTriangle, label: '警告', color: 'text-amber-600' },
  { type: 'error', icon: XCircle, label: 'エラー', color: 'text-red-600' },
  { type: 'success', icon: CheckCircle, label: '成功', color: 'text-green-600' },
]

function CalloutDialog({ isOpen, onClose }: CalloutDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedType, setSelectedType] = useState<CalloutType>('info')
  const [content, setContent] = useState('')

  const handleSubmit = () => {
    editor.dispatchCommand(INSERT_CALLOUT_COMMAND, {
      calloutType: selectedType,
      content: content.trim(),
    })
    onClose()
    setSelectedType('info')
    setContent('')
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>コールアウトを挿入</h3>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton()}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>タイプ</label>
            <div className={styles.typeGrid()}>
              {CALLOUT_TYPES.map(({ type, icon: Icon, label, color }) => (
                <button
                  key={type}
                  type="button"
                  className={`${styles.typeButton()} ${
                    selectedType === type
                      ? styles.typeButtonActive()
                      : styles.typeButtonInactive()
                  }`}
                  onClick={() => setSelectedType(type)}
                >
                  <Icon className={`${styles.typeIcon()} ${color}`} />
                  <span className={styles.typeLabel()}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>内容（任意）</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="コールアウトのテキストを入力..."
              className={styles.textarea()}
            />
          </div>

          <div className={styles.actions()}>
            <button
              type="button"
              onClick={onClose}
              className={`${styles.button()} ${styles.buttonSecondary()}`}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className={`${styles.button()} ${styles.buttonPrimary()}`}
            >
              挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function useCalloutDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openCalloutDialog = () => {
    setIsOpen(true)
  }

  const closeCalloutDialog = () => {
    setIsOpen(false)
  }

  const CalloutDialogComponent = () => (
    <CalloutDialog isOpen={isOpen} onClose={closeCalloutDialog} />
  )

  return {
    openCalloutDialog,
    closeCalloutDialog,
    CalloutDialog: CalloutDialogComponent,
  }
}

export function CalloutPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([CalloutNode])) {
      throw new Error('CalloutPlugin: CalloutNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_CALLOUT_COMMAND,
        (payload) => {
          const calloutNode = $createCalloutNode(
            payload.calloutType,
            payload.content
          )

          $insertNodes([calloutNode])
          if ($isRootOrShadowRoot(calloutNode.getParentOrThrow())) {
            $wrapNodeInElement(calloutNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
