/**
 * Toolbar Plugin
 *
 * エディタのフォーマットツールバー
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  type HeadingTagType,
} from '@lexical/rich-text'
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
} from '@lexical/list'
import { $createCodeNode } from '@lexical/code'
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  mergeRegister,
} from '@lexical/utils'
import { $setBlocksType } from '@lexical/selection'
import { tv } from 'tailwind-variants'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Highlighter,
  Link,
  Image as ImageIcon,
  Youtube,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Subscript,
  Superscript,
  Newspaper,
  Table,
} from 'lucide-react'
import type { BlockType } from '../types'

const styles = tv({
  slots: {
    toolbar: [
      'flex flex-wrap items-center gap-1 p-2',
      'border-b bg-muted/30',
    ],
    group: 'flex items-center gap-0.5',
    divider: 'w-px h-6 bg-border mx-1',
    button: [
      'p-1.5 rounded-md transition-colors',
      'hover:bg-muted text-muted-foreground hover:text-foreground',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    ],
    select: [
      'h-8 px-2 text-sm rounded-md border bg-background',
      'focus:outline-none focus:ring-2 focus:ring-primary',
    ],
  },
  variants: {
    active: {
      true: {
        button: 'bg-primary/20 text-primary',
      },
    },
  },
})()

type ToolbarPluginProps = {
  disabled?: boolean
  onInsertImage?: () => void
  onInsertVideo?: () => void
  onInsertLink?: () => void
  onInsertTable?: () => void
  onInsertWidget?: () => void
}

export function ToolbarPlugin({
  disabled = false,
  onInsertImage,
  onInsertVideo,
  onInsertLink,
  onInsertTable,
  onInsertWidget,
}: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [blockType, setBlockType] = useState<BlockType>('paragraph')
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isSubscript, setIsSubscript] = useState(false)
  const [isSuperscript, setIsSuperscript] = useState(false)
  const [isCode, setIsCode] = useState(false)
  const [isHighlight, setIsHighlight] = useState(false)

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      // Update text format state
      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))
      setIsUnderline(selection.hasFormat('underline'))
      setIsStrikethrough(selection.hasFormat('strikethrough'))
      setIsSubscript(selection.hasFormat('subscript'))
      setIsSuperscript(selection.hasFormat('superscript'))
      setIsCode(selection.hasFormat('code'))
      setIsHighlight(selection.hasFormat('highlight'))

      // Update block type
      const anchorNode = selection.anchor.getNode()
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent()
              return parent !== null && $isRootOrShadowRoot(parent)
            })

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow()
      }

      const elementKey = element.getKey()
      const elementDOM = editor.getElementByKey(elementKey)

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode
          )
          const type = parentList
            ? parentList.getListType()
            : element.getListType()
          setBlockType(type === 'number' ? 'number' : 'bullet')
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : element.getType()
          if (type in blockTypeToBlockName) {
            setBlockType(type as BlockType)
          }
        }
      }
    }
  }, [editor])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          $updateToolbar()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $updateToolbar()
          return false
        },
        1
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload)
          return false
        },
        1
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload)
          return false
        },
        1
      )
    )
  }, [editor, $updateToolbar])

  const formatParagraph = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode())
      }
    })
  }, [editor])

  const formatHeading = useCallback(
    (headingSize: HeadingTagType) => {
      if (blockType !== headingSize) {
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode(headingSize))
          }
        })
      }
    },
    [blockType, editor]
  )

  const formatQuote = useCallback(() => {
    if (blockType !== 'quote') {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode())
        }
      })
    }
  }, [blockType, editor])

  const formatCode = useCallback(() => {
    if (blockType !== 'code') {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          if (selection.isCollapsed()) {
            $setBlocksType(selection, () => $createCodeNode())
          } else {
            const textContent = selection.getTextContent()
            const codeNode = $createCodeNode()
            selection.insertNodes([codeNode])
            const newSelection = $getSelection()
            if ($isRangeSelection(newSelection)) {
              newSelection.insertRawText(textContent)
            }
          }
        }
      })
    }
  }, [blockType, editor])

  return (
    <div className={styles.toolbar()}>
      {/* Undo/Redo */}
      <div className={styles.group()}>
        <button
          type="button"
          disabled={disabled || !canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          className={styles.button()}
          aria-label="元に戻す"
          title="元に戻す"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled || !canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          className={styles.button()}
          aria-label="やり直す"
          title="やり直す"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      <div className={styles.divider()} />

      {/* Block Type */}
      <div className={styles.group()}>
        <button
          type="button"
          disabled={disabled}
          onClick={formatParagraph}
          className={styles.button({ active: blockType === 'paragraph' })}
          aria-label="段落"
          title="段落"
        >
          <Pilcrow className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => formatHeading('h1')}
          className={styles.button({ active: blockType === 'h1' })}
          aria-label="見出し1"
          title="見出し1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => formatHeading('h2')}
          className={styles.button({ active: blockType === 'h2' })}
          aria-label="見出し2"
          title="見出し2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => formatHeading('h3')}
          className={styles.button({ active: blockType === 'h3' })}
          aria-label="見出し3"
          title="見出し3"
        >
          <Heading3 className="w-4 h-4" />
        </button>
      </div>

      <div className={styles.divider()} />

      {/* Text Formatting */}
      <div className={styles.group()}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
          className={styles.button({ active: isBold })}
          aria-label="太字"
          title="太字"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
          className={styles.button({ active: isItalic })}
          aria-label="斜体"
          title="斜体"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
          className={styles.button({ active: isUnderline })}
          aria-label="下線"
          title="下線"
        >
          <Underline className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
          className={styles.button({ active: isStrikethrough })}
          aria-label="打消し線"
          title="打消し線"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')}
          className={styles.button({ active: isSubscript })}
          aria-label="下付き"
          title="下付き"
        >
          <Subscript className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')}
          className={styles.button({ active: isSuperscript })}
          aria-label="上付き"
          title="上付き"
        >
          <Superscript className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
          className={styles.button({ active: isCode })}
          aria-label="インラインコード"
          title="インラインコード"
        >
          <Code className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')}
          className={styles.button({ active: isHighlight })}
          aria-label="ハイライト"
          title="ハイライト"
        >
          <Highlighter className="w-4 h-4" />
        </button>
      </div>

      <div className={styles.divider()} />

      {/* Lists & Quote & Code */}
      <div className={styles.group()}>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          }
          className={styles.button({ active: blockType === 'bullet' })}
          aria-label="箇条書き"
          title="箇条書き"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
          }
          className={styles.button({ active: blockType === 'number' })}
          aria-label="番号付きリスト"
          title="番号付きリスト"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={formatQuote}
          className={styles.button({ active: blockType === 'quote' })}
          aria-label="引用"
          title="引用"
        >
          <Quote className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={formatCode}
          className={styles.button({ active: blockType === 'code' })}
          aria-label="コードブロック"
          title="コードブロック"
        >
          <Code className="w-4 h-4" />
        </button>
      </div>

      <div className={styles.divider()} />

      {/* Insert */}
      <div className={styles.group()}>
        {onInsertLink && (
          <button
            type="button"
            disabled={disabled}
            onClick={onInsertLink}
            className={styles.button()}
            aria-label="リンク"
            title="リンク"
          >
            <Link className="w-4 h-4" />
          </button>
        )}
        {onInsertImage && (
          <button
            type="button"
            disabled={disabled}
            onClick={onInsertImage}
            className={styles.button()}
            aria-label="画像"
            title="画像"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
        )}
        {onInsertVideo && (
          <button
            type="button"
            disabled={disabled}
            onClick={onInsertVideo}
            className={styles.button()}
            aria-label="YouTube"
            title="YouTube"
          >
            <Youtube className="w-4 h-4" />
          </button>
        )}
        {onInsertTable && (
          <button
            type="button"
            disabled={disabled}
            onClick={onInsertTable}
            className={styles.button()}
            aria-label="テーブル"
            title="テーブル"
          >
            <Table className="w-4 h-4" />
          </button>
        )}
        {onInsertWidget && (
          <button
            type="button"
            disabled={disabled}
            onClick={onInsertWidget}
            className={styles.button()}
            aria-label="記事リストウィジェット"
            title="記事リストウィジェット"
          >
            <Newspaper className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

const blockTypeToBlockName: Record<string, string> = {
  paragraph: '段落',
  h1: '見出し1',
  h2: '見出し2',
  h3: '見出し3',
  h4: '見出し4',
  h5: '見出し5',
  h6: '見出し6',
  bullet: '箇条書き',
  number: '番号付きリスト',
  check: 'チェックリスト',
  quote: '引用',
  code: 'コードブロック',
}
