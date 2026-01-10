'use client'

/**
 * リッチテキストエディタ
 *
 * Tiptap (ProseMirror) ベースのエディタコンポーネント
 * ブログ記事・ページ編集用
 *
 * 機能:
 * - テキストフォーマット（太字、斜体、下線、取り消し線、上付き、下付き）
 * - 見出し（H1-H3）、テキスト配置
 * - リスト（箇条書き、番号付き、タスク）
 * - テーブル、引用、コードブロック
 * - 画像・動画埋め込み、リンク
 * - 文字色・背景色
 * - BubbleMenu、FloatingMenu
 */

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

// テーブル
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

// テキスト装飾
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'

// リスト
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

// UX
import Dropcursor from '@tiptap/extension-dropcursor'

// メディア・その他
import Youtube from '@tiptap/extension-youtube'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'

import { cn } from '@/lib/utils'
import { EditorToolbar } from './EditorToolbar'
import { EditorBubbleMenu } from './EditorBubbleMenu'
import { EditorFloatingMenu } from './EditorFloatingMenu'
import { PostListWidget } from './PostListWidgetExtension'

// =============================================================================
// Types
// =============================================================================

export interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** 文字数制限（デフォルト: 50000） */
  characterLimit?: number
  /** BubbleMenuを表示するか（デフォルト: true） */
  showBubbleMenu?: boolean
  /** FloatingMenuを表示するか（デフォルト: true） */
  showFloatingMenu?: boolean
}

// =============================================================================
// Lowlight (Syntax Highlighting)
// =============================================================================

const lowlight = createLowlight(common)

// =============================================================================
// Main Component
// =============================================================================

export function RichTextEditor({
  content,
  onChange,
  placeholder = '記事の本文を入力...',
  disabled = false,
  className,
  characterLimit = 50000,
  showBubbleMenu = true,
  showFloatingMenu = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      // 基本機能（StarterKit）
      StarterKit.configure({
        codeBlock: false, // CodeBlockLowlightを使用するため無効化
        dropcursor: false, // 独自のDropcursorを使用
      }),

      // 既存の拡張
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-4',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'rounded-lg bg-muted p-4 font-mono text-sm',
        },
      }),

      // テーブル
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full',
        },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-border p-2',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-border p-2 bg-muted font-semibold',
        },
      }),

      // テキスト装飾
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Subscript,
      Superscript,

      // リスト
      TaskList.configure({
        HTMLAttributes: {
          class: 'list-none pl-0',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'flex items-start gap-2',
        },
      }),

      // UX
      Dropcursor.configure({
        color: '#3b82f6',
        width: 2,
      }),

      // メディア
      Youtube.configure({
        width: 640,
        height: 360,
        HTMLAttributes: {
          class: 'rounded-lg overflow-hidden',
        },
      }),

      // その他
      CharacterCount.configure({
        limit: characterLimit,
      }),
      Typography, // スマート引用符、自動変換

      // カスタム拡張
      PostListWidget, // 記事リストウィジェット
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm sm:prose-base max-w-none',
          'prose-headings:font-bold prose-headings:tracking-tight',
          'prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
          'prose-p:leading-relaxed',
          'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
          'prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground/30',
          'prose-blockquote:pl-4 prose-blockquote:italic',
          'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5',
          'prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:bg-muted prose-pre:rounded-lg',
          'prose-img:rounded-lg',
          'prose-hr:border-border',
          // テーブルスタイル
          'prose-table:border-collapse prose-table:w-full',
          'prose-td:border prose-td:border-border prose-td:p-2',
          'prose-th:border prose-th:border-border prose-th:p-2 prose-th:bg-muted',
          // タスクリストスタイル
          '[&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:pl-0',
          '[&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]]:gap-2',
          'min-h-[400px] p-4 focus:outline-none'
        ),
      },
    },
    // SSR対策
    immediatelyRender: false,
  })

  // 文字数取得
  const characterCount = editor?.storage.characterCount?.characters() ?? 0

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-background',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {/* メインツールバー */}
      <EditorToolbar editor={editor} />

      {/* BubbleMenu（テキスト選択時） */}
      {editor && showBubbleMenu && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
        >
          <EditorBubbleMenu editor={editor} />
        </BubbleMenu>
      )}

      {/* FloatingMenu（空行で表示） */}
      {editor && showFloatingMenu && (
        <FloatingMenu
          editor={editor}
          className="flex flex-col rounded-lg border bg-background p-1 shadow-lg"
        >
          <EditorFloatingMenu editor={editor} />
        </FloatingMenu>
      )}

      {/* エディタ本体 */}
      <EditorContent editor={editor} />

      {/* 文字数カウント */}
      <div className="flex items-center justify-end border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {characterCount.toLocaleString()} / {characterLimit.toLocaleString()} 文字
        </span>
      </div>
    </div>
  )
}
