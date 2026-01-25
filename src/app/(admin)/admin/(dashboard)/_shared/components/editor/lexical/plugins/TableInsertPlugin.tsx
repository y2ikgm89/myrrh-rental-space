/**
 * Table Insert Plugin
 *
 * @description テーブル挿入ダイアログを提供するプラグイン
 */

'use client'

import { useCallback, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { INSERT_TABLE_COMMAND } from '@lexical/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/admin/components/ui/dialog'
import { Button } from '@/admin/components/ui/button'
import { Input } from '@/admin/components/ui/input'
import { Label } from '@/admin/components/ui/label'

// =============================================================================
// Types
// =============================================================================

type TableInsertPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Hook
// =============================================================================

export function useTableDialog() {
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false)

  const openTableDialog = useCallback(() => setIsTableDialogOpen(true), [])
  const closeTableDialog = useCallback(() => setIsTableDialogOpen(false), [])

  return {
    isTableDialogOpen,
    openTableDialog,
    closeTableDialog,
  }
}

// =============================================================================
// Component
// =============================================================================

export function TableInsertPlugin({ isOpen, onClose }: TableInsertPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [rows, setRows] = useState('3')
  const [columns, setColumns] = useState('3')

  // バリデーション（派生値として計算）
  const rowNum = parseInt(rows, 10)
  const colNum = parseInt(columns, 10)
  const isValid =
    !isNaN(rowNum) &&
    !isNaN(colNum) &&
    rowNum > 0 &&
    rowNum <= 100 &&
    colNum > 0 &&
    colNum <= 20

  const handleInsert = () => {
    if (!isValid) return

    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      rows,
      columns,
      includeHeaders: true,
    })

    // リセット
    setRows('3')
    setColumns('3')
    onClose()
  }

  const handleClose = () => {
    setRows('3')
    setColumns('3')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>テーブルを挿入</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rows" className="text-right">
              行数
            </Label>
            <Input
              id="rows"
              type="number"
              min={1}
              max={100}
              value={rows}
              onChange={(e) => setRows(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="columns" className="text-right">
              列数
            </Label>
            <Input
              id="columns"
              type="number"
              min={1}
              max={20}
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert} disabled={!isValid}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
