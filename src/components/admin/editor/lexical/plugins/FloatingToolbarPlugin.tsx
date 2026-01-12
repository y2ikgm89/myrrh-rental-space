/**
 * Floating Toolbar Plugin
 *
 * テキスト選択時に表示されるフローティングツールバー
 */

'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
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

const styles = tv({
  slots: {
    toolbar: [
      'absolute flex items-center gap-0.5 p-1',
      'bg-popover border rounded-lg shadow-lg z-50',
      'animate-in fade-in-0 zoom-in-95',
    ],
    button: [
      'p-1.5 rounded-md transition-colors',
      'hover:bg-muted text-muted-foreground hover:text-foreground',
    ],
    divider: 'w-px h-5 bg-border mx-0.5',
  },
  variants: {
    active: {
      true: {
        button: 'bg-primary/20 text-primary',
      },
    },
  },
})()

function FloatingToolbar() {
  const [editor] = useLexicalComposerContext()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isHighlight, setIsHighlight] = useState(false)
  const [isLink, setIsLink] = useState(false)

  const updateToolbar = useCallback(() => {
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
        if (toolbarRef.current) {
          toolbarRef.current.style.left = `${x}px`
          toolbarRef.current.style.top = `${y}px`
        }
      })
    }

    setIsVisible(true)
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
  }, [editor, updateToolbar])

  const insertLink = useCallback(() => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    } else {
      const url = prompt('URLを入力してください:')
      if (url) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
      }
    }
  }, [editor, isLink])

  if (!isVisible) {
    return null
  }

  return (
    <div ref={toolbarRef} className={styles.toolbar()}>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        className={styles.button({ active: isBold })}
        aria-label="太字"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        className={styles.button({ active: isItalic })}
        aria-label="斜体"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        className={styles.button({ active: isUnderline })}
        aria-label="下線"
      >
        <Underline className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
        className={styles.button({ active: isStrikethrough })}
        aria-label="打消し線"
      >
        <Strikethrough className="w-4 h-4" />
      </button>

      <div className={styles.divider()} />

      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
        className={styles.button({ active: isCode })}
        aria-label="コード"
      >
        <Code className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')}
        className={styles.button({ active: isHighlight })}
        aria-label="ハイライト"
      >
        <Highlighter className="w-4 h-4" />
      </button>

      <div className={styles.divider()} />

      <button
        type="button"
        onClick={insertLink}
        className={styles.button({ active: isLink })}
        aria-label={isLink ? 'リンク解除' : 'リンク'}
      >
        {isLink ? (
          <Link2Off className="w-4 h-4" />
        ) : (
          <Link className="w-4 h-4" />
        )}
      </button>
    </div>
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
