/**
 * Toolbar Plugin
 *
 * エディタのフォーマットツールバー
 * ドロップダウンメニュー形式でグループ化
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
  Info,
  HelpCircle,
  MousePointerClick,
  LayoutGrid,
  Minus,
  Type,
  Plus,
  Puzzle,
  Calendar,
} from 'lucide-react'
import { TooltipProvider } from '@/components/admin/ui'
import { ToolbarButton, ToolbarDropdown } from './toolbar'
import type { ToolbarDropdownGroup, ToolbarDropdownItem } from './toolbar'
import {
  KEYBOARD_SHORTCUTS,
  getShortcutDisplay,
} from '../config/keyboard-shortcuts'
import type { BlockType } from '../types'

const styles = tv({
  slots: {
    toolbar: [
      'flex flex-wrap items-center gap-1 p-2',
      'border-b bg-muted/30',
    ],
    group: 'flex items-center gap-0.5',
    divider: 'w-px h-6 bg-border mx-1',
  },
})()

type ToolbarPluginProps = {
  disabled?: boolean
  onInsertImage?: () => void
  onOpenMediaLibrary?: () => void
  onInsertVideo?: () => void
  onInsertLink?: () => void
  onInsertTable?: () => void
  onInsertWidget?: () => void
  onInsertCallout?: () => void
  onInsertFAQ?: () => void
  onInsertButton?: () => void
  onInsertCard?: () => void
  onInsertDivider?: () => void
  onInsertReservationWidget?: () => void
}

export function ToolbarPlugin({
  disabled = false,
  onInsertImage,
  onOpenMediaLibrary,
  onInsertVideo,
  onInsertLink,
  onInsertTable,
  onInsertWidget,
  onInsertCallout,
  onInsertFAQ,
  onInsertButton,
  onInsertCard,
  onInsertDivider,
  onInsertReservationWidget,
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
          if (VALID_BLOCK_TYPES.has(type)) {
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

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode())
      }
    })
  }

  const formatHeading = (headingSize: HeadingTagType) => {
    if (blockType !== headingSize) {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode(headingSize))
        }
      })
    }
  }

  const formatQuote = () => {
    if (blockType !== 'quote') {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode())
        }
      })
    }
  }

  const formatCodeBlock = () => {
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
  }

  // ブロックタイプドロップダウンのアイテム
  const blockTypeGroups: ToolbarDropdownGroup[] = [
    {
      items: [
        {
          id: 'paragraph',
          icon: Pilcrow,
          label: '段落',
          isActive: blockType === 'paragraph',
          onClick: formatParagraph,
        },
        {
          id: 'h1',
          icon: Heading1,
          label: '見出し1',
          shortcut: getShortcutDisplay('h1'),
          isActive: blockType === 'h1',
          onClick: () => formatHeading('h1'),
        },
        {
          id: 'h2',
          icon: Heading2,
          label: '見出し2',
          shortcut: getShortcutDisplay('h2'),
          isActive: blockType === 'h2',
          onClick: () => formatHeading('h2'),
        },
        {
          id: 'h3',
          icon: Heading3,
          label: '見出し3',
          shortcut: getShortcutDisplay('h3'),
          isActive: blockType === 'h3',
          onClick: () => formatHeading('h3'),
        },
      ],
    },
    {
      items: [
        {
          id: 'bullet',
          icon: List,
          label: '箇条書き',
          shortcut: getShortcutDisplay('bulletList'),
          isActive: blockType === 'bullet',
          onClick: () =>
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
        },
        {
          id: 'number',
          icon: ListOrdered,
          label: '番号付きリスト',
          shortcut: getShortcutDisplay('numberedList'),
          isActive: blockType === 'number',
          onClick: () =>
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
        },
      ],
    },
    {
      items: [
        {
          id: 'quote',
          icon: Quote,
          label: '引用',
          shortcut: getShortcutDisplay('quote'),
          isActive: blockType === 'quote',
          onClick: formatQuote,
        },
        {
          id: 'code',
          icon: Code,
          label: 'コードブロック',
          isActive: blockType === 'code',
          onClick: formatCodeBlock,
        },
      ],
    },
  ]

  // 挿入ドロップダウンのアイテム（条件付きでフィルタリング）
  const mediaItems = [
    onInsertLink && {
      id: 'link',
      icon: Link,
      label: 'リンク',
      shortcut: getShortcutDisplay('link'),
      onClick: onInsertLink,
    },
    onOpenMediaLibrary && {
      id: 'media-library',
      icon: ImageIcon,
      label: 'メディアライブラリ',
      onClick: onOpenMediaLibrary,
    },
    onInsertImage && {
      id: 'image',
      icon: ImageIcon,
      label: '画像（直接アップロード）',
      onClick: onInsertImage,
    },
    onInsertVideo && {
      id: 'video',
      icon: Youtube,
      label: 'YouTube動画',
      onClick: onInsertVideo,
    },
    onInsertTable && {
      id: 'table',
      icon: Table,
      label: 'テーブル',
      onClick: onInsertTable,
    },
    onInsertWidget && {
      id: 'widget',
      icon: Newspaper,
      label: '記事リストウィジェット',
      onClick: onInsertWidget,
    },
    onInsertReservationWidget && {
      id: 'reservation-widget',
      icon: Calendar,
      label: '予約ウィジェット',
      onClick: onInsertReservationWidget,
    },
  ].filter(Boolean) as ToolbarDropdownItem[]

  const insertGroups: ToolbarDropdownGroup[] =
    mediaItems.length > 0 ? [{ items: mediaItems }] : []

  // コンポーネントドロップダウンのアイテム
  const componentItems = [
    onInsertCallout && {
      id: 'callout',
      icon: Info,
      label: 'コールアウト',
      onClick: onInsertCallout,
    },
    onInsertFAQ && {
      id: 'faq',
      icon: HelpCircle,
      label: 'FAQ',
      onClick: onInsertFAQ,
    },
    onInsertButton && {
      id: 'button',
      icon: MousePointerClick,
      label: 'ボタン',
      onClick: onInsertButton,
    },
    onInsertCard && {
      id: 'card',
      icon: LayoutGrid,
      label: 'カード',
      onClick: onInsertCard,
    },
    onInsertDivider && {
      id: 'divider',
      icon: Minus,
      label: '区切り線',
      onClick: onInsertDivider,
    },
  ].filter(Boolean) as ToolbarDropdownItem[]

  const componentGroups: ToolbarDropdownGroup[] =
    componentItems.length > 0 ? [{ items: componentItems }] : []

  return (
    <TooltipProvider delayDuration={300}>
      <div className={styles.toolbar()}>
        {/* Undo/Redo */}
        <div className={styles.group()}>
          <ToolbarButton
            icon={Undo}
            label={KEYBOARD_SHORTCUTS.undo.label}
            shortcut={getShortcutDisplay('undo')}
            disabled={disabled || !canUndo}
            onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
          />
          <ToolbarButton
            icon={Redo}
            label={KEYBOARD_SHORTCUTS.redo.label}
            shortcut={getShortcutDisplay('redo')}
            disabled={disabled || !canRedo}
            onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
          />
        </div>

        <div className={styles.divider()} />

        {/* Block Type Dropdown */}
        <ToolbarDropdown
          icon={Type}
          label="ブロック"
          groups={blockTypeGroups}
          disabled={disabled}
        />

        <div className={styles.divider()} />

        {/* Text Formatting */}
        <div className={styles.group()}>
          <ToolbarButton
            icon={Bold}
            label={KEYBOARD_SHORTCUTS.bold.label}
            shortcut={getShortcutDisplay('bold')}
            isActive={isBold}
            disabled={disabled}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
          />
          <ToolbarButton
            icon={Italic}
            label={KEYBOARD_SHORTCUTS.italic.label}
            shortcut={getShortcutDisplay('italic')}
            isActive={isItalic}
            disabled={disabled}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
            }
          />
          <ToolbarButton
            icon={Underline}
            label={KEYBOARD_SHORTCUTS.underline.label}
            shortcut={getShortcutDisplay('underline')}
            isActive={isUnderline}
            disabled={disabled}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')
            }
          />
          <ToolbarButton
            icon={Strikethrough}
            label={KEYBOARD_SHORTCUTS.strikethrough.label}
            shortcut={getShortcutDisplay('strikethrough')}
            isActive={isStrikethrough}
            disabled={disabled}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
            }
          />
        </div>

        <div className={styles.divider()} />

        {/* Additional Text Formatting */}
        <div className={styles.group()}>
          <ToolbarButton
            icon={Subscript}
            label="下付き"
            isActive={isSubscript}
            disabled={disabled}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')
            }
          />
          <ToolbarButton
            icon={Superscript}
            label="上付き"
            isActive={isSuperscript}
            disabled={disabled}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')
            }
          />
          <ToolbarButton
            icon={Code}
            label={KEYBOARD_SHORTCUTS.code.label}
            shortcut={getShortcutDisplay('code')}
            isActive={isCode}
            disabled={disabled}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}
          />
          <ToolbarButton
            icon={Highlighter}
            label="ハイライト"
            isActive={isHighlight}
            disabled={disabled}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'highlight')
            }
          />
        </div>

        {/* Insert Dropdown */}
        {insertGroups.length > 0 && (
          <>
            <div className={styles.divider()} />
            <ToolbarDropdown
              icon={Plus}
              label="挿入"
              groups={insertGroups}
              disabled={disabled}
            />
          </>
        )}

        {/* Components Dropdown */}
        {componentGroups.length > 0 && (
          <>
            <div className={styles.divider()} />
            <ToolbarDropdown
              icon={Puzzle}
              label="コンポーネント"
              groups={componentGroups}
              disabled={disabled}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

const VALID_BLOCK_TYPES = new Set([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'bullet',
  'number',
  'check',
  'quote',
  'code',
])
