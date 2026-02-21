/**
 * Insert Items Configuration
 *
 * @description ToolbarPlugin / ComponentPickerPlugin 共通のインサートアイテム定義
 *
 * 新しいインサートアイテムを追加する場合：
 * 1. INSERT_ITEMS 配列にエントリーを追加
 * 2. type: 'dialog' の場合は dialog-registry.ts にもエントリーを追加
 */

import type { LexicalEditor, ElementNode } from 'lexical'
import type { LucideIcon } from 'lucide-react'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
} from 'lexical'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from '@lexical/list'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import { $createCodeNode } from '@lexical/code'
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  TextQuote,
  List,
  ListOrdered,
  ListChecks,
  Image as ImageIcon,
  Youtube,
  Video,
  Twitter,
  Instagram,
  Table,
  Minus,
  Code,
  Columns,
  CaseLower,
  CaseUpper,
  CaseSensitive,
  Scissors,
  AlertCircle,
  ChevronsDownUp,
  MousePointerClick,
  Quote,
  Link2,
  Footprints,
  PanelTop,
  ListTree,
  Blocks,
  Save,
  Map,
  Volume2,
  Paperclip,
} from 'lucide-react'
import { applyTextCaseToSelection } from '../plugins/TextCasePlugin'
import { INSERT_PAGE_BREAK_COMMAND } from '../plugins/PageBreakPlugin'
import { INSERT_COLLAPSIBLE_COMMAND } from '../plugins/CollapsiblePlugin'
import { INSERT_TOC_COMMAND } from '../plugins/TableOfContentsPlugin'
import type { DialogId } from '../dialogs/dialog-types'

// =============================================================================
// Types
// =============================================================================

export type InsertCategory = 'basic' | 'list' | 'media' | 'layout' | 'format' | 'widget' | 'other' | 'template'

type InsertItemBase = {
  id: string
  label: string
  icon: LucideIcon
  keywords: readonly string[]
  category: InsertCategory
  /** Toolbar Insert メニューに表示するか */
  showInToolbar: boolean
  /** ComponentPicker "/" に表示するか */
  showInPicker: boolean
}

type DialogInsertItem = InsertItemBase & {
  type: 'dialog'
  dialogId: DialogId
}

type CommandInsertItem = InsertItemBase & {
  type: 'command'
  dispatch: (editor: LexicalEditor) => void
}

type TransformInsertItem = InsertItemBase & {
  type: 'transform'
  transform: (editor: LexicalEditor) => void
}

export type InsertItem = DialogInsertItem | CommandInsertItem | TransformInsertItem

// =============================================================================
// Category Labels
// =============================================================================

export const CATEGORY_LABELS: Record<InsertCategory, string> = {
  basic: '基本ブロック',
  list: 'リスト',
  media: 'メディア',
  layout: 'レイアウト',
  format: 'テキスト変換',
  widget: 'ウィジェット',
  other: 'その他',
  template: 'テンプレート',
}

export const CATEGORY_ORDER: readonly InsertCategory[] = [
  'basic',
  'list',
  'media',
  'layout',
  'format',
  'widget',
  'other',
  'template',
] as const

/** セパレータを表示しないカテゴリ遷移ペア（Toolbar Insertメニューのビジュアルグループ化用） */
export const MERGED_CATEGORY_PAIRS: ReadonlySet<string> = new Set([
  'media→layout',
])

// =============================================================================
// Helpers for transform items
// =============================================================================

function setBlockType(editor: LexicalEditor, createNode: () => ElementNode) {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      $setBlocksType(selection, createNode)
    }
  })
}

// =============================================================================
// Insert Items
// =============================================================================

const INSERT_ITEMS: readonly InsertItem[] = [
  // ========== 基本ブロック ==========
  {
    id: 'paragraph',
    type: 'transform',
    label: '本文',
    icon: Pilcrow,
    keywords: ['paragraph', 'normal', 'honbun', 'text'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createParagraphNode()),
  },
  {
    id: 'h1',
    type: 'transform',
    label: '見出し1',
    icon: Heading1,
    keywords: ['heading', 'h1', 'midashi', 'title'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createHeadingNode('h1')),
  },
  {
    id: 'h2',
    type: 'transform',
    label: '見出し2',
    icon: Heading2,
    keywords: ['heading', 'h2', 'midashi'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createHeadingNode('h2')),
  },
  {
    id: 'h3',
    type: 'transform',
    label: '見出し3',
    icon: Heading3,
    keywords: ['heading', 'h3', 'midashi'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createHeadingNode('h3')),
  },
  {
    id: 'h4',
    type: 'transform',
    label: '見出し4',
    icon: Heading4,
    keywords: ['heading', 'h4', 'midashi'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createHeadingNode('h4')),
  },
  {
    id: 'quote',
    type: 'transform',
    label: '引用',
    icon: TextQuote,
    keywords: ['quote', 'blockquote', 'inyou'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createQuoteNode()),
  },
  {
    id: 'code',
    type: 'transform',
    label: 'コードブロック',
    icon: Code,
    keywords: ['code', 'codeblock', 'programming', 'koudo'],
    category: 'basic',
    showInToolbar: false,
    showInPicker: true,
    transform: (editor) => setBlockType(editor, () => $createCodeNode()),
  },

  // ========== リスト ==========
  {
    id: 'ul',
    type: 'command',
    label: '箇条書き',
    icon: List,
    keywords: ['bullet', 'list', 'ul', 'kajogaki'],
    category: 'list',
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
  },
  {
    id: 'ol',
    type: 'command',
    label: '番号付きリスト',
    icon: ListOrdered,
    keywords: ['numbered', 'list', 'ol', 'bangou'],
    category: 'list',
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
  },
  {
    id: 'checklist',
    type: 'command',
    label: 'チェックリスト',
    icon: ListChecks,
    keywords: ['check', 'todo', 'list', 'chekkurisuto', 'task'],
    category: 'list',
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
  },

  // ========== メディア ==========
  {
    id: 'image',
    type: 'dialog',
    label: '画像',
    icon: ImageIcon,
    keywords: ['image', 'photo', 'picture', 'gazou', 'img'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'image',
  },
  {
    id: 'youtube',
    type: 'dialog',
    label: 'YouTube',
    icon: Youtube,
    keywords: ['youtube', 'video', 'embed', 'douga', 'movie'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'youtube',
  },
  {
    id: 'vimeo',
    type: 'dialog',
    label: 'Vimeo',
    icon: Video,
    keywords: ['vimeo', 'video', 'embed', 'douga', 'movie'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'vimeo',
  },
  {
    id: 'x',
    type: 'dialog',
    label: 'X (Twitter)',
    icon: Twitter,
    keywords: ['x', 'twitter', 'tweet', 'embed', 'social', 'sns'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'x',
  },
  {
    id: 'instagram',
    type: 'dialog',
    label: 'Instagram',
    icon: Instagram,
    keywords: ['instagram', 'insta', 'embed', 'social', 'sns', 'photo'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'instagram',
  },
  {
    id: 'mapEmbed',
    type: 'dialog',
    label: 'Google マップ',
    icon: Map,
    keywords: ['map', 'google', 'maps', 'chizu', 'embed', 'location', 'access'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'mapEmbed',
  },
  {
    id: 'audio',
    type: 'dialog',
    label: '音声プレイヤー',
    icon: Volume2,
    keywords: ['audio', '音声', 'sound', 'music', '音楽', 'podcast'],
    category: 'media',
    showInToolbar: false,
    showInPicker: true,
    dialogId: 'audio',
  },
  {
    id: 'file',
    type: 'dialog',
    label: 'ファイル添付',
    icon: Paperclip,
    keywords: ['file', 'ファイル', 'download', 'ダウンロード', 'attach', '添付'],
    category: 'media',
    showInToolbar: false,
    showInPicker: true,
    dialogId: 'file',
  },
  {
    id: 'table',
    type: 'dialog',
    label: 'テーブル',
    icon: Table,
    keywords: ['table', 'grid', 'hyou', 'excel'],
    category: 'media',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'table',
  },

  // ========== レイアウト ==========
  {
    id: 'layout',
    type: 'dialog',
    label: 'カラム',
    icon: Columns,
    keywords: ['column', 'layout', 'grid', 'karamu', '2column', '3column'],
    category: 'layout',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'layout',
  },
  {
    id: 'callout',
    type: 'dialog',
    label: 'コールアウト',
    icon: AlertCircle,
    keywords: ['callout', 'alert', 'note', 'chuui', 'info', 'warning'],
    category: 'layout',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'callout',
  },
  {
    id: 'pullQuote',
    type: 'dialog',
    label: 'プルクォート',
    icon: Quote,
    keywords: ['pullquote', 'quote', 'inyou', 'blockquote', 'highlight'],
    category: 'layout',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'pullQuote',
  },
  {
    id: 'collapsible',
    type: 'command',
    label: '折りたたみ',
    icon: ChevronsDownUp,
    keywords: ['collapsible', 'accordion', 'faq', 'oritakamu', 'toggle', 'details'],
    category: 'layout',
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined),
  },
  {
    id: 'steps',
    type: 'dialog',
    label: 'ステップ',
    icon: Footprints,
    keywords: ['steps', 'howto', 'guide', 'junban', 'tejun', 'process'],
    category: 'layout',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'steps',
  },
  {
    id: 'tabs',
    type: 'dialog',
    label: 'タブ',
    icon: PanelTop,
    keywords: ['tabs', 'tabu', 'switch', 'panel', 'toggle'],
    category: 'layout',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'tabs',
  },

  // ========== テキスト変換 ==========
  {
    id: 'lowercase',
    type: 'command',
    label: '小文字',
    icon: CaseLower,
    keywords: ['lowercase', 'komoji', 'small', 'lower'],
    category: 'format',
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => applyTextCaseToSelection(editor, 'lowercase'),
  },
  {
    id: 'uppercase',
    type: 'command',
    label: '大文字',
    icon: CaseUpper,
    keywords: ['uppercase', 'oomoji', 'capital', 'upper'],
    category: 'format',
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => applyTextCaseToSelection(editor, 'uppercase'),
  },
  {
    id: 'capitalize',
    type: 'command',
    label: '先頭大文字',
    icon: CaseSensitive,
    keywords: ['capitalize', 'sentou', 'title', 'titlecase'],
    category: 'format',
    showInToolbar: false,
    showInPicker: true,
    dispatch: (editor) => applyTextCaseToSelection(editor, 'capitalize'),
  },

  // ========== ウィジェット ==========
  {
    id: 'button',
    type: 'dialog',
    label: 'ボタン',
    icon: MousePointerClick,
    keywords: ['button', 'cta', 'botan', 'link', 'action'],
    category: 'widget',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'button',
  },
  {
    id: 'bookmark',
    type: 'dialog',
    label: 'ブックマーク',
    icon: Link2,
    keywords: ['bookmark', 'ogp', 'card', 'linkcard', 'embed', 'shiori'],
    category: 'widget',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'bookmark',
  },

  // ========== その他 ==========
  {
    id: 'hr',
    type: 'command',
    label: '区切り線',
    icon: Minus,
    keywords: ['divider', 'hr', 'horizontal', 'kugirisenn', 'line'],
    category: 'other',
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
  },
  {
    id: 'toc',
    type: 'command',
    label: '目次',
    icon: ListTree,
    keywords: ['toc', 'table of contents', 'mokuji', 'heading', 'navigation'],
    category: 'other',
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_TOC_COMMAND, undefined),
  },
  {
    id: 'pageBreak',
    type: 'command',
    label: 'ページ区切り',
    icon: Scissors,
    keywords: ['pagebreak', 'print', 'kukiri', 'page', 'insatsu'],
    category: 'other',
    showInToolbar: true,
    showInPicker: true,
    dispatch: (editor) => editor.dispatchCommand(INSERT_PAGE_BREAK_COMMAND, undefined),
  },

  // ========== テンプレート ==========
  {
    id: 'blockTemplateInsert',
    type: 'dialog',
    label: 'テンプレート挿入',
    icon: Blocks,
    keywords: ['template', 'block', 'tenpure-to', 'テンプレート', 'ブロック', 'saiyou'],
    category: 'template',
    showInToolbar: true,
    showInPicker: true,
    dialogId: 'blockTemplateInsert',
  },
  {
    id: 'blockTemplateSave',
    type: 'dialog',
    label: 'テンプレート保存',
    icon: Save,
    keywords: ['template', 'save', 'hozon', 'テンプレート', '保存'],
    category: 'template',
    showInToolbar: true,
    showInPicker: false,
    dialogId: 'blockTemplateSave',
  },
]

// =============================================================================
// Query Functions
// =============================================================================

/** Toolbar用: showInToolbar=trueのアイテム。dialog系はopenDialogがある場合のみ含む */
export function getToolbarInsertItems(hasDialog: boolean): readonly InsertItem[] {
  return INSERT_ITEMS.filter((item) => {
    if (!item.showInToolbar) return false
    if (item.type === 'dialog' && !hasDialog) return false
    return true
  })
}

/** ComponentPicker用: showInPicker=trueのアイテム。dialog系はopenDialogがある場合のみ含む */
export function getPickerInsertItems(hasDialog: boolean): readonly InsertItem[] {
  return INSERT_ITEMS.filter((item) => {
    if (!item.showInPicker) return false
    if (item.type === 'dialog' && !hasDialog) return false
    return true
  })
}

/** アイテムのonSelect実行 */
export function executeInsertItem(
  item: InsertItem,
  editor: LexicalEditor,
  openDialog?: (id: DialogId) => void
): void {
  switch (item.type) {
    case 'dialog':
      openDialog?.(item.dialogId)
      break
    case 'command':
      item.dispatch(editor)
      break
    case 'transform':
      item.transform(editor)
      break
  }
}
