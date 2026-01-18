/**
 * Floating Toolbar Plugin
 *
 * テキスト選択時に表示されるフローティングツールバー
 * リンク挿入はダイアログで行う
 */

'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { mergeRegister } from '@lexical/utils'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { tv } from 'tailwind-variants'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Highlighter,
  Link,
  Link2Off,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  TooltipProvider,
} from '@/admin/components/ui'
import { Z_INDEX } from '@/admin/lib/styles/z-index'
import { ToolbarButton } from './toolbar'
import {
  KEYBOARD_SHORTCUTS,
  getShortcutDisplay,
} from '../config/keyboard-shortcuts'

const styles = tv({
  slots: {
    toolbar: [
      'absolute flex items-center gap-0.5 p-1',
      'bg-popover border rounded-lg shadow-lg',
      'animate-in fade-in-0 zoom-in-95',
    ],
    divider: 'w-px h-5 bg-border mx-0.5',
  },
})()

function FloatingToolbar() {
  const [editor] = useLexicalComposerContext()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const isMountedRef = useRef(true)
  const [isVisible, setIsVisible] = useState(false)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isHighlight, setIsHighlight] = useState(false)
  const [isLink, setIsLink] = useState(false)

  // リンクダイアログ状態
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const updateToolbar = () => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      setIsVisible(false)
      return
    }

    const nativeSelection = window.getSelection()
    if (!nativeSelection || nativeSelection.rangeCount === 0) {
      setIsVisible(false)
      return
    }

    const range = nativeSelection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    if (rect.width === 0 || rect.height === 0) {
      setIsVisible(false)
      return
    }

    // Check text formats
    setIsBold(selection.hasFormat('bold'))
    setIsItalic(selection.hasFormat('italic'))
    setIsUnderline(selection.hasFormat('underline'))
    setIsStrikethrough(selection.hasFormat('strikethrough'))
    setIsCode(selection.hasFormat('code'))
    setIsHighlight(selection.hasFormat('highlight'))

    // Check if link
    const node = selection.anchor.getNode()
    const parent = node.getParent()
    setIsLink($isLinkNode(parent) || $isLinkNode(node))

    // Position the toolbar
    if (toolbarRef.current) {
      const virtualEl = {
        getBoundingClientRect: () => rect,
      }

      computePosition(virtualEl, toolbarRef.current, {
        placement: 'top',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        // アンマウント後にDOMを更新しない
        if (!isMountedRef.current) return
        if (toolbarRef.current) {
          toolbarRef.current.style.left = `${x}px`
          toolbarRef.current.style.top = `${y}px`
        }
      })
    }

    setIsVisible(true)
  }

  // マウント状態を追跡
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar()
          return false
        },
        1
      )
    )
  }, [editor])

  const handleLinkClick = () => {
    if (isLink) {
      // リンク解除
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    } else {
      // リンクダイアログを開く
      setLinkUrl('')
      setIsLinkDialogOpen(true)
    }
  }

  const handleLinkSubmit = () => {
    if (linkUrl.trim()) {
      // URLの形式を整える
      let url = linkUrl.trim()
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
        url = `https://${url}`
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
    }
    setIsLinkDialogOpen(false)
    setLinkUrl('')
  }

  const handleLinkKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleLinkSubmit()
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div
          ref={toolbarRef}
          className={styles.toolbar()}
          style={{ zIndex: Z_INDEX.editorFloating }}
        >
          <ToolbarButton
            icon={Bold}
            label={KEYBOARD_SHORTCUTS.bold.label}
            shortcut={getShortcutDisplay('bold')}
            isActive={isBold}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
          />
          <ToolbarButton
            icon={Italic}
            label={KEYBOARD_SHORTCUTS.italic.label}
            shortcut={getShortcutDisplay('italic')}
            isActive={isItalic}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
          />
          <ToolbarButton
            icon={Underline}
            label={KEYBOARD_SHORTCUTS.underline.label}
            shortcut={getShortcutDisplay('underline')}
            isActive={isUnderline}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
          />
          <ToolbarButton
            icon={Strikethrough}
            label={KEYBOARD_SHORTCUTS.strikethrough.label}
            shortcut={getShortcutDisplay('strikethrough')}
            isActive={isStrikethrough}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
          />

          <div className={styles.divider()} />

          <ToolbarButton
            icon={Code}
            label={KEYBOARD_SHORTCUTS.code.label}
            shortcut={getShortcutDisplay('code')}
            isActive={isCode}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
          />
          <ToolbarButton
            icon={Highlighter}
            label="ハイライト"
            isActive={isHighlight}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')}
          />

          <div className={styles.divider()} />

          <ToolbarButton
            icon={isLink ? Link2Off : Link}
            label={isLink ? 'リンク解除' : KEYBOARD_SHORTCUTS.link.label}
            shortcut={isLink ? undefined : getShortcutDisplay('link')}
            isActive={isLink}
            onClick={handleLinkClick}
          />
        </div>
      </TooltipProvider>

      {/* リンク挿入ダイアログ */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>リンクを挿入</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={handleLinkKeyDown}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsLinkDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={handleLinkSubmit}>
              挿入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Client-side only check using useSyncExternalStore
const emptySubscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function FloatingToolbarPlugin() {
  const isClient = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot)

  if (!isClient) {
    return null
  }

  return createPortal(<FloatingToolbar />, document.body)
}
