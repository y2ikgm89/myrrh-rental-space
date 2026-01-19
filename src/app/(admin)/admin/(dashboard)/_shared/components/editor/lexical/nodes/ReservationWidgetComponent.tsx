/**
 * ReservationWidget Component
 *
 * エディタ内で予約ウィジェットを表示・編集するコンポーネント
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
import { Calendar, Settings, Trash2 } from 'lucide-react'
import { $isReservationWidgetNode } from './ReservationWidgetNode'

const styles = tv({
  slots: {
    wrapper: [
      'relative rounded-lg border-2 p-4 transition-colors',
      'bg-gradient-to-br from-green-500/5 to-green-500/10',
    ],
    header: 'flex items-center justify-between mb-3',
    title: 'flex items-center gap-2 font-medium text-sm',
    actions: 'flex items-center gap-1',
    actionButton: [
      'p-1.5 rounded-md transition-colors',
      'hover:bg-green-500/20 text-muted-foreground hover:text-foreground',
    ],
    content: 'space-y-2',
    badge: 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400',
    preview: 'text-sm text-muted-foreground',
    dialog: 'absolute top-full left-0 mt-2 p-4 bg-popover border rounded-lg shadow-lg z-50 min-w-[280px]',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    select: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm',
    checkbox: 'flex items-center gap-2',
    dialogActions: 'flex justify-end gap-2 mt-4',
    button: 'px-3 py-1.5 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-green-600 text-white hover:bg-green-700',
    buttonSecondary: 'border hover:bg-muted',
  },
  variants: {
    selected: {
      true: {
        wrapper: 'border-green-500 ring-2 ring-green-500/20',
      },
      false: {
        wrapper: 'border-border hover:border-green-500/50',
      },
    },
  },
})()

type ReservationWidgetComponentProps = {
  nodeKey: string
  spaceId?: string
  showCalendar: boolean
  showPricing: boolean
  title?: string
}

export function ReservationWidgetComponent({
  nodeKey,
  spaceId,
  showCalendar,
  showPricing,
  title,
}: ReservationWidgetComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [showSettings, setShowSettings] = useState(false)
  const [localSpaceId, setLocalSpaceId] = useState(spaceId || '')
  const [localShowCalendar, setLocalShowCalendar] = useState(showCalendar)
  const [localShowPricing, setLocalShowPricing] = useState(showPricing)
  const [localTitle, setLocalTitle] = useState(title || '')

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isReservationWidgetNode(node)) {
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
          const widgetWrapper = target.closest('.reservation-widget-wrapper')
          if (widgetWrapper) {
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

  const handleSaveSettings = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isReservationWidgetNode(node)) {
        node.setSpaceId(localSpaceId || undefined)
        node.setShowCalendar(localShowCalendar)
        node.setShowPricing(localShowPricing)
        node.setTitle(localTitle || undefined)
      }
    })
    setShowSettings(false)
  }

  const handleRemove = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isReservationWidgetNode(node)) {
        node.remove()
      }
    })
  }

  return (
    <div className={styles.wrapper({ selected: isSelected })}>
      <div className={styles.header()}>
        <div className={styles.title()}>
          <Calendar className="w-4 h-4 text-green-600" />
          <span>予約ウィジェット</span>
        </div>
        <div className={styles.actions()}>
          <button
            type="button"
            className={styles.actionButton()}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="設定"
          >
            <Settings className="w-4 h-4" />
          </button>
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

      <div className={styles.content()}>
        <div className="flex items-center gap-2 flex-wrap">
          {title && <span className={styles.badge()}>{title}</span>}
          {spaceId ? (
            <span className={styles.badge()}>
              スペース: {spaceId.slice(0, 8)}...
            </span>
          ) : (
            <span className={styles.badge()}>全スペース</span>
          )}
          {showCalendar && <span className={styles.badge()}>カレンダー表示</span>}
          {showPricing && <span className={styles.badge()}>料金表示</span>}
        </div>
        <p className={styles.preview()}>
          公開時にこの位置に予約フォームが表示されます
        </p>
      </div>

      {showSettings && (
        <div className={styles.dialog()}>
          <div className="space-y-4">
            <div className={styles.field()}>
              <label className={styles.label()}>タイトル（任意）</label>
              <input
                type="text"
                className={styles.input()}
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                placeholder="ご予約はこちら"
              />
            </div>

            <div className={styles.field()}>
              <label className={styles.label()}>スペースID（任意）</label>
              <input
                type="text"
                className={styles.input()}
                value={localSpaceId}
                onChange={(e) => setLocalSpaceId(e.target.value)}
                placeholder="空欄で全スペース対象"
              />
              <p className="text-xs text-muted-foreground">
                特定のスペースのみ表示する場合は入力
              </p>
            </div>

            <div className={styles.field()}>
              <label className={styles.checkbox()}>
                <input
                  type="checkbox"
                  checked={localShowCalendar}
                  onChange={(e) => setLocalShowCalendar(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-sm">カレンダーを表示</span>
              </label>
            </div>

            <div className={styles.field()}>
              <label className={styles.checkbox()}>
                <input
                  type="checkbox"
                  checked={localShowPricing}
                  onChange={(e) => setLocalShowPricing(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-sm">料金情報を表示</span>
              </label>
            </div>
          </div>

          <div className={styles.dialogActions()}>
            <button
              type="button"
              className={`${styles.button()} ${styles.buttonSecondary()}`}
              onClick={() => setShowSettings(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={`${styles.button()} ${styles.buttonPrimary()}`}
              onClick={handleSaveSettings}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
