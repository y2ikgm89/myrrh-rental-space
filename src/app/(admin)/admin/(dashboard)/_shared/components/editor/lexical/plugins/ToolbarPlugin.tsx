/**
 * Toolbar Plugin
 *
 * @description エディタツールバーを提供するプラグイン
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type ElementFormatType,
} from 'lexical'
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $isHeadingNode, $createHeadingNode, type HeadingTagType } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Columns,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image as ImageIcon,
  Instagram,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Plus,
  Redo,
  Strikethrough,
  Table,
  TextQuote,
  Underline,
  Undo,
  Youtube,
  Twitter,
} from 'lucide-react'
import { Button } from '@/admin/components/ui/button'
import { Separator } from '@/admin/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/admin/components/ui/dropdown-menu'
import { $createQuoteNode, $isQuoteNode } from '@lexical/rich-text'
import { FontSizePlugin } from './FontSizePlugin'
import { HighlightPlugin } from './HighlightPlugin'
import { TextColorPlugin } from './TextColorPlugin'
import { TextCasePlugin } from './TextCasePlugin'

// =============================================================================
// Types
// =============================================================================

type ToolbarPluginProps = {
  onInsertImage?: () => void
  onInsertYouTube?: () => void
  onInsertX?: () => void
  onInsertInstagram?: () => void
  onInsertLink?: () => void
  onInsertTable?: () => void
  onInsertLayout?: () => void
}

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'ul' | 'ol'

type BlockTypeConfig = {
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const BLOCK_TYPE_CONFIG: Record<BlockType, BlockTypeConfig> = {
  paragraph: { label: '本文', icon: Pilcrow },
  h1: { label: '見出し1', icon: Heading1 },
  h2: { label: '見出し2', icon: Heading2 },
  h3: { label: '見出し3', icon: Heading3 },
  h4: { label: '見出し4', icon: Heading4 },
  quote: { label: '引用', icon: TextQuote },
  ul: { label: '箇条書き', icon: List },
  ol: { label: '番号付き', icon: ListOrdered },
}

// テキスト配置オプション
type AlignmentType = 'left' | 'center' | 'right' | 'justify'

const ALIGNMENT_TYPES = new Set<AlignmentType>(['left', 'center', 'right', 'justify'])

function isAlignmentType(value: string): value is AlignmentType {
  return ALIGNMENT_TYPES.has(value as AlignmentType)
}

type AlignmentConfig = {
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const ALIGNMENT_CONFIG: Record<AlignmentType, AlignmentConfig> = {
  left: { label: '左揃え', icon: AlignLeft },
  center: { label: '中央揃え', icon: AlignCenter },
  right: { label: '右揃え', icon: AlignRight },
  justify: { label: '両端揃え', icon: AlignJustify },
}

// =============================================================================
// Component
// =============================================================================

export function ToolbarPlugin({
  onInsertImage,
  onInsertYouTube,
  onInsertX,
  onInsertInstagram,
  onInsertLink,
  onInsertTable,
  onInsertLayout,
}: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext()

  // 状態
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrikethrough, setIsStrikethrough] = useState(false)
  const [isLink, setIsLink] = useState(false)
  const [blockType, setBlockType] = useState<BlockType>('paragraph')
  const [elementFormat, setElementFormat] = useState<AlignmentType>('left')

  // ツールバー状態を更新
  const updateToolbar = useCallback(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return

    // テキストフォーマット
    setIsBold(selection.hasFormat('bold'))
    setIsItalic(selection.hasFormat('italic'))
    setIsUnderline(selection.hasFormat('underline'))
    setIsStrikethrough(selection.hasFormat('strikethrough'))

    // リンク
    const node = selection.anchor.getNode()
    const parent = node.getParent()
    setIsLink($isLinkNode(parent) || $isLinkNode(node))

    // ブロックタイプ
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
        const parentList = $findMatchingParent(anchorNode, $isListNode)
        const type = parentList ? parentList.getListType() : element.getListType()
        setBlockType(type === 'bullet' ? 'ul' : 'ol')
      } else {
        const type = $isHeadingNode(element)
          ? element.getTag()
          : $isQuoteNode(element)
            ? 'quote'
            : 'paragraph'
        setBlockType(type as BlockType)
      }

      // テキスト配置を取得
      const topElement = anchorNode.getTopLevelElementOrThrow()
      const formatType = topElement.getFormatType()
      setElementFormat(isAlignmentType(formatType) ? formatType : 'left')
    }
  }, [editor])

  // リスナー登録
  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar()
        })
      }),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload)
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload)
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      )
    )
  }, [editor, updateToolbar])

  // ハンドラー
  const handleUndo = () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
  }

  const handleRedo = () => {
    editor.dispatchCommand(REDO_COMMAND, undefined)
  }

  const handleFormatBold = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
  }

  const handleFormatItalic = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
  }

  const handleFormatUnderline = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')
  }

  const handleFormatStrikethrough = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')
  }

  const handleInsertLink = () => {
    if (onInsertLink) {
      onInsertLink()
    } else {
      // フォールバック: ダイアログが提供されていない場合はリンク解除のみ
      if (isLink) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
      }
    }
  }

  const handleInsertHorizontalRule = () => {
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
  }

  const handleInsertList = (type: 'ul' | 'ol') => {
    if (type === 'ul') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
    }
  }

  const handleBlockTypeChange = (type: BlockType) => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return

      if (type === 'ul' || type === 'ol') {
        handleInsertList(type)
        return
      }

      if (type === 'quote') {
        $setBlocksType(selection, () => $createQuoteNode())
        return
      }

      if (type === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode())
        return
      }

      // Heading
      $setBlocksType(selection, () => $createHeadingNode(type as HeadingTagType))
    })
  }

  const handleAlignmentChange = (format: ElementFormatType) => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format)
  }

  // 挿入メニューに項目があるかチェック
  const hasInsertItems = onInsertImage || onInsertYouTube || onInsertX || onInsertInstagram || onInsertTable || onInsertLayout

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-background p-1">
      {/* Undo/Redo */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleUndo}
        disabled={!canUndo}
        title="元に戻す"
      >
        <Undo className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleRedo}
        disabled={!canRedo}
        title="やり直す"
      >
        <Redo className="h-5 w-5 md:h-4 md:w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Text Format */}
      <Button
        type="button"
        variant={isBold ? 'secondary' : 'ghost'}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleFormatBold}
        title="太字"
      >
        <Bold className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isItalic ? 'secondary' : 'ghost'}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleFormatItalic}
        title="斜体"
      >
        <Italic className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isUnderline ? 'secondary' : 'ghost'}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleFormatUnderline}
        title="下線"
      >
        <Underline className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isStrikethrough ? 'secondary' : 'ghost'}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleFormatStrikethrough}
        title="取り消し線"
      >
        <Strikethrough className="h-5 w-5 md:h-4 md:w-4" />
      </Button>

      {/* Highlight */}
      <HighlightPlugin />

      {/* Text Color */}
      <TextColorPlugin />

      {/* Text Case */}
      <TextCasePlugin />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Font Size */}
      <FontSizePlugin />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Block Type Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {(() => {
            const { label, icon: BlockIcon } = BLOCK_TYPE_CONFIG[blockType]
            return (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 min-w-[100px] justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <BlockIcon className="h-4 w-4" />
                  <span className="text-xs">{label}</span>
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            )
          })()}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[160px]">
          {(Object.entries(BLOCK_TYPE_CONFIG) as [BlockType, BlockTypeConfig][]).map(
            ([type, { label, icon: Icon }]) => (
              <DropdownMenuItem
                key={type}
                onClick={() => handleBlockTypeChange(type)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </span>
                {blockType === type && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Text Alignment Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {(() => {
            const { label, icon: AlignIcon } = ALIGNMENT_CONFIG[elementFormat]
            return (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 min-w-[90px] justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <AlignIcon className="h-4 w-4" />
                  <span className="text-xs">{label}</span>
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            )
          })()}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {(Object.entries(ALIGNMENT_CONFIG) as [AlignmentType, AlignmentConfig][]).map(
            ([type, { label, icon: Icon }]) => (
              <DropdownMenuItem
                key={type}
                onClick={() => handleAlignmentChange(type)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </span>
                {elementFormat === type && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Link */}
      <Button
        type="button"
        variant={isLink ? 'secondary' : 'ghost'}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={handleInsertLink}
        title="リンク"
      >
        <Link className="h-5 w-5 md:h-4 md:w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Insert Dropdown */}
      {hasInsertItems && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs">挿入</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {onInsertImage && (
              <DropdownMenuItem onClick={onInsertImage} className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                <span>画像</span>
              </DropdownMenuItem>
            )}
            {onInsertYouTube && (
              <DropdownMenuItem onClick={onInsertYouTube} className="flex items-center gap-2">
                <Youtube className="h-4 w-4" />
                <span>YouTube</span>
              </DropdownMenuItem>
            )}
            {onInsertX && (
              <DropdownMenuItem onClick={onInsertX} className="flex items-center gap-2">
                <Twitter className="h-4 w-4" />
                <span>X (Twitter)</span>
              </DropdownMenuItem>
            )}
            {onInsertInstagram && (
              <DropdownMenuItem onClick={onInsertInstagram} className="flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                <span>Instagram</span>
              </DropdownMenuItem>
            )}
            {onInsertTable && (
              <DropdownMenuItem onClick={onInsertTable} className="flex items-center gap-2">
                <Table className="h-4 w-4" />
                <span>テーブル</span>
              </DropdownMenuItem>
            )}
            {onInsertLayout && (
              <DropdownMenuItem onClick={onInsertLayout} className="flex items-center gap-2">
                <Columns className="h-4 w-4" />
                <span>カラム</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleInsertHorizontalRule} className="flex items-center gap-2">
              <Minus className="h-4 w-4" />
              <span>区切り線</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
