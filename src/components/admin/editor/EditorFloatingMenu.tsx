'use client'

/**
 * FloatingMenu コンポーネント
 *
 * 空行で表示されるスラッシュコマンドメニュー
 * ブロック要素の挿入を提供
 */

import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'

interface EditorFloatingMenuProps {
  editor: Editor
}

interface MenuItemProps {
  onClick: () => void
  icon: React.ReactNode
  label: string
  shortcut?: string
}

function MenuItem({ onClick, icon, label, shortcut }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm',
        'hover:bg-muted transition-colors',
        'focus-visible:outline-none focus-visible:bg-muted'
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      )}
    </button>
  )
}

export function EditorFloatingMenu({ editor }: EditorFloatingMenuProps) {
  return (
    <div className="w-48 space-y-0.5">
      {/* 見出し */}
      <MenuItem
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        icon={<span className="text-xs font-bold">H1</span>}
        label="見出し1"
        shortcut="# "
      />
      <MenuItem
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        icon={<span className="text-xs font-bold">H2</span>}
        label="見出し2"
        shortcut="## "
      />
      <MenuItem
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        icon={<span className="text-xs font-bold">H3</span>}
        label="見出し3"
        shortcut="### "
      />

      <div className="my-1 h-px bg-border" />

      {/* リスト */}
      <MenuItem
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 4h13v2H8V4ZM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM8 11h13v2H8v-2Zm0 7h13v2H8v-2Z" />
          </svg>
        }
        label="箇条書き"
        shortcut="- "
      />
      <MenuItem
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 4h13v2H8V4ZM5 3v3h1v1H3V6h1V4H3V3h2Zm-2 7h3.5v1H4v1h1.5v1H3v-4Zm2 9v-1H3v-1h3v4H3v-1h2Zm3-8h13v2H8v-2Zm0 7h13v2H8v-2Z" />
          </svg>
        }
        label="番号付き"
        shortcut="1. "
      />
      <MenuItem
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v14h14V5H5Zm6.003 11L6.76 11.757l1.414-1.414 2.829 2.829 5.656-5.657 1.415 1.414L11.003 16Z" />
          </svg>
        }
        label="タスクリスト"
        shortcut="[ ] "
      />

      <div className="my-1 h-px bg-border" />

      {/* ブロック */}
      <MenuItem
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Z" />
          </svg>
        }
        label="引用"
        shortcut="> "
      />
      <MenuItem
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v14h16V5H4Zm16 7-3.536 3.536-1.414-1.415L17.172 12l-2.122-2.121 1.414-1.415L20 12ZM6.828 12l2.122 2.121-1.414 1.415L4 12l3.536-3.536L8.95 9.88 6.828 12Zm4.416 5H9.116l3.64-10h2.128l-3.64 10Z" />
          </svg>
        }
        label="コードブロック"
        shortcut="``` "
      />

      <div className="my-1 h-px bg-border" />

      {/* テーブル */}
      <MenuItem
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v4h6V5H5Zm8 0v4h6V5h-6Zm6 6h-6v4h6v-4Zm0 6h-6v4h6v-4ZM11 21v-4H5v4h6Zm-6-6h6v-4H5v4Z" />
          </svg>
        }
        label="テーブル"
      />

      {/* 水平線 */}
      <MenuItem
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 11h2v2H2v-2Zm4 0h12v2H6v-2Zm14 0h2v2h-2v-2Z" />
          </svg>
        }
        label="水平線"
        shortcut="---"
      />

      <div className="my-1 h-px bg-border" />

      {/* メディア */}
      <MenuItem
        onClick={() => {
          const url = window.prompt('画像URL')
          if (url) {
            editor.chain().focus().setImage({ src: url }).run()
          }
        }}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.828 21l-.02.02-.021-.02H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H4.828ZM20 15V5H4v14L14 9l6 6Zm0 2.828-6-6L6.828 19H20v-1.172ZM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
          </svg>
        }
        label="画像"
      />
      <MenuItem
        onClick={() => {
          const url = window.prompt('YouTube URL')
          if (url) {
            editor.chain().focus().setYoutubeVideo({ src: url }).run()
          }
        }}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.244 4c.534.003 1.87.016 3.29.073l.504.022c1.429.067 2.857.183 3.566.38.945.266 1.687 1.04 1.938 2.022.4 1.56.45 4.602.454 5.208v.59c-.004.606-.054 3.648-.454 5.208-.251.982-.993 1.756-1.938 2.022-.709.197-2.137.313-3.566.38l-.504.023c-1.42.056-2.756.07-3.29.072l-.488.001-.243-.001c-.534-.003-1.87-.016-3.29-.073l-.504-.022c-1.429-.067-2.857-.183-3.566-.38-.945-.266-1.687-1.04-1.938-2.022C2 16.242 2 12.2 2 12V11.8c0-.2 0-4.242.455-5.502.251-.982.993-1.756 1.938-2.022.709-.197 2.137-.313 3.566-.38l.504-.023C9.883 3.817 11.22 3.804 11.754 3.802L12 3.8l.244.2ZM10 15.464V8.536L16 12l-6 3.464Z" />
          </svg>
        }
        label="YouTube"
      />

      <div className="my-1 h-px bg-border" />

      {/* 記事リストウィジェット */}
      <MenuItem
        onClick={() => editor.commands.insertPostListWidget({ type: 'recent', count: 5 })}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-8h4v2h-6V7h2v5Z" />
          </svg>
        }
        label="最新記事"
      />
      <MenuItem
        onClick={() => editor.commands.insertPostListWidget({ type: 'popular', count: 5 })}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23a7.5 7.5 0 0 0 7.5-7.5c0-.866-.23-1.697-.5-2.47-1.667 1.647-2.933 2.47-3.8 2.47 3.995-7 1.8-10-4.2-14.5.5 2-.5 4-2.5 6-1.5-1-2.5-3-2.5-6a7.498 7.498 0 0 0-1.5 14.5c0 1.38-.5 2.5-1.5 3.5.867.333 1.79.5 2.5.5a7.5 7.5 0 0 0 6.5-3.5Z" />
          </svg>
        }
        label="人気記事"
      />
      <MenuItem
        onClick={() => editor.commands.insertPostListWidget({ type: 'related', count: 5 })}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM9 9H5V5h4v4Zm11-6h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Zm-1 6h-4V5h4v4Zm1 4h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1Zm-1 6h-4v-4h4v4Zm-9-6H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1Zm-1 6H5v-4h4v4Z" />
          </svg>
        }
        label="関連記事"
      />
    </div>
  )
}
