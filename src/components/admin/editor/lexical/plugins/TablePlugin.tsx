/**
 * Table Plugin
 *
 * テーブルの挿入・編集機能
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { INSERT_TABLE_COMMAND } from '@lexical/table'
import { tv } from 'tailwind-variants'
import { X, Table } from 'lucide-react'

const styles = tv({
  slots: {
    overlay: 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center',
    dialog: 'bg-popover rounded-lg shadow-lg p-4 w-full max-w-sm',
    header: 'flex items-center justify-between mb-4',
    title: 'text-lg font-semibold',
    closeButton: 'p-1 rounded-md hover:bg-muted',
    form: 'space-y-4',
    field: 'space-y-1.5',
    label: 'text-sm font-medium',
    input: 'w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary',
    grid: 'grid grid-cols-2 gap-4',
    preview: 'mt-4 p-4 border rounded-lg bg-muted/50',
    previewGrid: 'grid gap-1',
    previewCell: 'w-8 h-6 bg-background border rounded',
    actions: 'flex justify-end gap-2 mt-4',
    button: 'px-4 py-2 text-sm rounded-md transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
})()

type TableDialogProps = {
  isOpen: boolean
  onClose: () => void
}

function TableDialog({ isOpen, onClose }: TableDialogProps) {
  const [editor] = useLexicalComposerContext()
  const [rows, setRows] = useState(3)
  const [columns, setColumns] = useState(3)

  const handleSubmit = () => {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      rows: rows.toString(),
      columns: columns.toString(),
    })
    onClose()
    setRows(3)
    setColumns(3)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.overlay()} onClick={onClose}>
      <div className={styles.dialog()} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header()}>
          <h3 className={styles.title()}>
            <Table className="w-5 h-5 inline mr-2 text-primary" />
            テーブルを挿入
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
          <div className={styles.grid()}>
            <div className={styles.field()}>
              <label className={styles.label()}>行数</label>
              <input
                type="number"
                value={rows}
                onChange={(e) =>
                  setRows(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))
                }
                min={1}
                max={10}
                className={styles.input()}
              />
            </div>
            <div className={styles.field()}>
              <label className={styles.label()}>列数</label>
              <input
                type="number"
                value={columns}
                onChange={(e) =>
                  setColumns(
                    Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                  )
                }
                min={1}
                max={10}
                className={styles.input()}
              />
            </div>
          </div>

          <div className={styles.preview()}>
            <div
              className={styles.previewGrid()}
              style={{
                gridTemplateColumns: `repeat(${Math.min(columns, 6)}, 1fr)`,
              }}
            >
              {Array.from({ length: Math.min(rows * columns, 36) }).map(
                (_, i) => (
                  <div key={i} className={styles.previewCell()} />
                )
              )}
            </div>
            {(rows > 6 || columns > 6) && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                プレビューは最大6x6まで表示
              </p>
            )}
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

export function useTableDialog() {
  const [isOpen, setIsOpen] = useState(false)

  const openTableDialog = () => {
    setIsOpen(true)
  }

  const closeTableDialog = () => {
    setIsOpen(false)
  }

  const TableDialogComponent = () => (
    <TableDialog isOpen={isOpen} onClose={closeTableDialog} />
  )

  return {
    openTableDialog,
    closeTableDialog,
    TableDialog: TableDialogComponent,
  }
}
