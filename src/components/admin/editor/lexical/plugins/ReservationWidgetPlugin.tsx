/**
 * ReservationWidget Plugin
 *
 * 予約ウィジェットの挿入機能
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
import { X, Calendar } from 'lucide-react'
import {
  $createReservationWidgetNode,
  ReservationWidgetNode,
  type ReservationWidgetOptions,
} from '../nodes'

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
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-green-500',
    hint: 'text-xs text-muted-foreground',
    checkbox: 'flex items-center gap-2',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-green-600 text-white hover:bg-green-700',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_RESERVATION_WIDGET_COMMAND: LexicalCommand<ReservationWidgetOptions> =
  createCommand('INSERT_RESERVATION_WIDGET_COMMAND')

type ReservationWidgetDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function ReservationWidgetDialog({ isOpen, onClose }: ReservationWidgetDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [spaceId, setSpaceId] = useState('')
  const [showCalendar, setShowCalendar] = useState(true)
  const [showPricing, setShowPricing] = useState(true)
  const [title, setTitle] = useState('')

  const handleSubmit = () => {
    editor.dispatchCommand(INSERT_RESERVATION_WIDGET_COMMAND, {
      spaceId: spaceId || undefined,
      showCalendar,
      showPricing,
      title: title || undefined,
    })
    onClose()
    setSpaceId('')
    setShowCalendar(true)
    setShowPricing(true)
    setTitle('')
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <Calendar className="w-5 h-5 inline mr-2 text-green-600" />
            予約ウィジェットを挿入
          </h3>
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
            <label className={styles.label()}>タイトル（任意）</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ご予約はこちら"
              className={styles.input()}
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>スペースID（任意）</label>
            <input
              type="text"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              placeholder="空欄で全スペース対象"
              className={styles.input()}
            />
            <p className={styles.hint()}>
              特定のスペースのみ表示する場合は入力
            </p>
          </div>

          <div className={styles.field()}>
            <label className={styles.checkbox()}>
              <input
                type="checkbox"
                checked={showCalendar}
                onChange={(e) => setShowCalendar(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm">カレンダーを表示</span>
            </label>
          </div>

          <div className={styles.field()}>
            <label className={styles.checkbox()}>
              <input
                type="checkbox"
                checked={showPricing}
                onChange={(e) => setShowPricing(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm">料金情報を表示</span>
            </label>
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

export function useReservationWidgetDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openReservationWidgetDialog = () => {
    setIsOpen(true)
  }

  const closeReservationWidgetDialog = () => {
    setIsOpen(false)
  }

  const ReservationWidgetDialogComponent = () => (
    <ReservationWidgetDialog isOpen={isOpen} onClose={closeReservationWidgetDialog} />
  )

  return {
    openReservationWidgetDialog,
    closeReservationWidgetDialog,
    ReservationWidgetDialog: ReservationWidgetDialogComponent,
  }
}

export function ReservationWidgetPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([ReservationWidgetNode])) {
      throw new Error(
        'ReservationWidgetPlugin: ReservationWidgetNode not registered on editor'
      )
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_RESERVATION_WIDGET_COMMAND,
        (payload) => {
          const widgetNode = $createReservationWidgetNode(payload)

          $insertNodes([widgetNode])
          if ($isRootOrShadowRoot(widgetNode.getParentOrThrow())) {
            $wrapNodeInElement(widgetNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
