/**
 * Button Plugin
 *
 * @description ボタン/CTAの挿入を提供するプラグイン
 *
 * ダイアログでテキスト、URL、スタイルを設定し、Buttonノードを挿入
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, $insertNodes } from 'lexical'
import {
  $createButtonNode,
  isButtonVariant,
  isButtonSize,
  isButtonAlignment,
  type ButtonVariant,
  type ButtonSize,
  type ButtonAlignment,
} from '../nodes/ButtonNode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  SelectionBox,
  Switch,
} from '@/admin/components/ui'

// =============================================================================
// Options
// =============================================================================

const VARIANT_OPTIONS = [
  { value: 'primary', label: 'プライマリ', description: 'メインカラーの目立つボタン' },
  { value: 'secondary', label: 'セカンダリ', description: '控えめなサブボタン' },
  { value: 'outline', label: 'アウトライン', description: '枠線のみのシンプルなボタン' },
]

const SIZE_OPTIONS = [
  { value: 'sm', label: '小', description: 'コンパクトなサイズ' },
  { value: 'md', label: '中', description: '標準サイズ' },
  { value: 'lg', label: '大', description: '大きく目立つサイズ' },
]

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: '左', description: '左寄せ' },
  { value: 'center', label: '中央', description: '中央揃え' },
  { value: 'right', label: '右', description: '右寄せ' },
]

// =============================================================================
// Hook
// =============================================================================

export function useButtonDialog() {
  const [isButtonDialogOpen, setIsButtonDialogOpen] = useState(false)

  const openButtonDialog = () => setIsButtonDialogOpen(true)
  const closeButtonDialog = () => setIsButtonDialogOpen(false)

  return {
    isButtonDialogOpen,
    openButtonDialog,
    closeButtonDialog,
  }
}

// =============================================================================
// Types
// =============================================================================

type ButtonPluginProps = {
  isOpen: boolean
  onClose: () => void
}

// =============================================================================
// Component
// =============================================================================

export function ButtonPlugin({ isOpen, onClose }: ButtonPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [text, setText] = useState('ボタン')
  const [href, setHref] = useState('')
  const [variant, setVariant] = useState<ButtonVariant>('primary')
  const [size, setSize] = useState<ButtonSize>('md')
  const [alignment, setAlignment] = useState<ButtonAlignment>('center')
  const [openInNewTab, setOpenInNewTab] = useState(false)

  const resetForm = () => {
    setText('ボタン')
    setHref('')
    setVariant('primary')
    setSize('md')
    setAlignment('center')
    setOpenInNewTab(false)
  }

  const handleInsert = () => {
    if (!text.trim() || !href.trim()) return

    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      const buttonNode = $createButtonNode({
        text: text.trim(),
        href: href.trim(),
        variant,
        size,
        alignment,
        openInNewTab,
      })

      $insertNodes([buttonNode])
    })

    resetForm()
    onClose()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const isValid = text.trim() !== '' && href.trim() !== ''

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>ボタンを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* テキスト */}
          <div className="space-y-2">
            <Label htmlFor="button-text">ボタンテキスト</Label>
            <Input
              id="button-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ボタンに表示するテキスト"
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="button-href">リンク先URL</Label>
            <Input
              id="button-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://example.com"
              type="url"
            />
          </div>

          {/* スタイル */}
          <div className="space-y-2">
            <Label>スタイル</Label>
            <SelectionBox
              options={VARIANT_OPTIONS}
              value={variant}
              onChange={(value) => isButtonVariant(value) && setVariant(value)}
              columns={3}
              name="ボタンスタイル"
            />
          </div>

          {/* サイズ */}
          <div className="space-y-2">
            <Label>サイズ</Label>
            <SelectionBox
              options={SIZE_OPTIONS}
              value={size}
              onChange={(value) => isButtonSize(value) && setSize(value)}
              columns={3}
              name="ボタンサイズ"
            />
          </div>

          {/* 配置 */}
          <div className="space-y-2">
            <Label>配置</Label>
            <SelectionBox
              options={ALIGNMENT_OPTIONS}
              value={alignment}
              onChange={(value) => isButtonAlignment(value) && setAlignment(value)}
              columns={3}
              name="ボタン配置"
            />
          </div>

          {/* 新しいタブで開く */}
          <div className="flex items-center justify-between">
            <Label htmlFor="button-new-tab" className="cursor-pointer">
              新しいタブで開く
            </Label>
            <Switch
              id="button-new-tab"
              checked={openInNewTab}
              onCheckedChange={setOpenInNewTab}
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
