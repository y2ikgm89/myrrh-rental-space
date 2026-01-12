/**
 * Divider Plugin
 *
 * 区切り線の挿入機能
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { X, Minus } from 'lucide-react'
import { $createDividerNode, DividerNode, type DividerStyle } from '../nodes/DividerNode'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-sm',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold flex items-center gap-2',
    titleIcon: 'w-5 h-5 text-primary',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    styleGrid: 'grid grid-cols-3 gap-2',
    styleButton: [
      'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors',
      'hover:border-primary/50 cursor-pointer',
    ],
    styleButtonActive: 'border-primary bg-primary/10',
    styleButtonInactive: 'border-border',
    styleLine: 'w-full border-t-2',
    styleLabel: 'text-xs text-muted-foreground',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

export const INSERT_DIVIDER_COMMAND: LexicalCommand<{
  dividerStyle: DividerStyle
}> = createCommand('INSERT_DIVIDER_COMMAND')

type DividerDialogProps = {
  isOpen: boolean
  onClose: () => void
}

const STYLE_CONFIG: Record<DividerStyle, { label: string; borderClass: string }> = {
  solid: { label: '実線', borderClass: 'border-solid' },
  dashed: { label: '破線', borderClass: 'border-dashed' },
  dotted: { label: '点線', borderClass: 'border-dotted' },
}

function DividerDialog({ isOpen, onClose }: DividerDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [selectedStyle, setSelectedStyle] = useState<DividerStyle>('solid')

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      editor.dispatchCommand(INSERT_DIVIDER_COMMAND, {
        dividerStyle: selectedStyle,
      })
      onClose()
      setSelectedStyle('solid')
    },
    [editor, selectedStyle, onClose]
  )

  const handleClose = useCallback(() => {
    onClose()
    setSelectedStyle('solid')
  }, [onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={handleClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <Minus className={styles.titleIcon()} />
            区切り線を挿入
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className={styles.closeButton()}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form()}>
          <div className={styles.field()}>
            <label className={styles.label()}>スタイル</label>
            <div className={styles.styleGrid()}>
              {(Object.keys(STYLE_CONFIG) as DividerStyle[]).map((style) => {
                const config = STYLE_CONFIG[style]
                return (
                  <button
                    key={style}
                    type="button"
                    className={`${styles.styleButton()} ${
                      selectedStyle === style
                        ? styles.styleButtonActive()
                        : styles.styleButtonInactive()
                    }`}
                    onClick={() => setSelectedStyle(style)}
                  >
                    <span
                      className={`${styles.styleLine()} ${config.borderClass} border-current`}
                    />
                    <span className={styles.styleLabel()}>{config.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className={styles.actions()}>
            <button
              type="button"
              onClick={handleClose}
              className={`${styles.button()} ${styles.buttonSecondary()}`}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={`${styles.button()} ${styles.buttonPrimary()}`}
            >
              挿入
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function useDividerDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openDividerDialog = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeDividerDialog = useCallback(() => {
    setIsOpen(false)
  }, [])

  const DividerDialogComponent = useCallback(
    () => <DividerDialog isOpen={isOpen} onClose={closeDividerDialog} />,
    [isOpen, closeDividerDialog]
  )

  return {
    openDividerDialog,
    closeDividerDialog,
    DividerDialog: DividerDialogComponent,
  }
}

export function DividerPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([DividerNode])) {
      throw new Error('DividerPlugin: DividerNode not registered on editor')
    }

    return mergeRegister(
      editor.registerCommand(
        INSERT_DIVIDER_COMMAND,
        (payload) => {
          const dividerNode = $createDividerNode(payload.dividerStyle)

          $insertNodes([dividerNode])
          if ($isRootOrShadowRoot(dividerNode.getParentOrThrow())) {
            $wrapNodeInElement(dividerNode, $createParagraphNode).selectEnd()
          }

          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [editor])

  return null
}
