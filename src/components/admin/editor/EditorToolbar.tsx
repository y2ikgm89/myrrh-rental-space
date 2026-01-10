'use client'

/**
 * エディタツールバー
 *
 * Tiptapエディタ用のツールバーコンポーネント
 * 全機能のボタンを提供
 */

import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Button, Input } from '@/components/admin/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/admin/ui'
import { cn } from '@/lib/utils'
import { ColorPicker } from './ColorPicker'
import { TableMenu } from './TableMenu'
import { ImageUploadDialog } from './ImageUploadDialog'

// =============================================================================
// Types
// =============================================================================

interface EditorToolbarProps {
  editor: Editor | null
}

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

// =============================================================================
// Toolbar Button
// =============================================================================

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded text-sm font-medium transition-colors',
        'hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        isActive && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-border" />
}

// =============================================================================
// Main Component
// =============================================================================

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)
  const [isYoutubeDialogOpen, setIsYoutubeDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')

  const setLink = useCallback(() => {
    if (!editor) return
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: linkUrl, target: '_blank' })
        .run()
    }
    setLinkUrl('')
    setIsLinkDialogOpen(false)
  }, [editor, linkUrl])

  const addYoutube = useCallback(() => {
    if (!editor || !youtubeUrl) return
    editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run()
    setYoutubeUrl('')
    setIsYoutubeDialogOpen(false)
  }, [editor, youtubeUrl])

  if (!editor) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1">
      {/* ========== テキストスタイル ========== */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="太字 (Ctrl+B)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 11h4.5a2.5 2.5 0 1 0 0-5H8v5Zm10 4.5a4.5 4.5 0 0 1-4.5 4.5H6V4h6.5a4.5 4.5 0 0 1 3.256 7.606A4.498 4.498 0 0 1 18 15.5ZM8 13v5h5.5a2.5 2.5 0 1 0 0-5H8Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="斜体 (Ctrl+I)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15 20H7v-2h2.927l2.116-12H9V4h8v2h-2.927l-2.116 12H15v2Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="下線 (Ctrl+U)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 3v9a4 4 0 1 0 8 0V3h2v9a6 6 0 1 1-12 0V3h2ZM4 20h16v2H4v-2Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="取り消し線"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.154 14c.23.516.346 1.09.346 1.72 0 1.342-.524 2.392-1.571 3.147C14.88 19.622 13.433 20 11.586 20c-1.64 0-3.263-.381-4.87-1.144V16.6c1.52.877 3.075 1.316 4.666 1.316 2.551 0 3.83-.732 3.839-2.197a2.21 2.21 0 0 0-.648-1.603l-.12-.117H3v-2h18v2h-3.846Zm-4.078-3H7.629a4.086 4.086 0 0 1-.481-.522C6.716 9.92 6.5 9.246 6.5 8.452c0-1.236.466-2.287 1.397-3.153C8.83 4.433 10.271 4 12.222 4c1.471 0 2.879.328 4.222.984v2.152c-1.2-.687-2.515-1.03-3.946-1.03-2.48 0-3.719.782-3.719 2.346 0 .42.218.786.654 1.099.436.313.974.562 1.613.75.62.18 1.297.414 2.03.699Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="インラインコード"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="m23 12-7.071 7.071-1.414-1.414L20.172 12l-5.657-5.657 1.414-1.414L23 12ZM3.828 12l5.657 5.657-1.414 1.414L1 12l7.071-7.071 1.414 1.414L3.828 12Z" />
        </svg>
      </ToolbarButton>

      {/* 上付き・下付き */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        isActive={editor.isActive('superscript')}
        title="上付き文字"
      >
        <span className="text-xs">X<sup className="text-[8px]">2</sup></span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        isActive={editor.isActive('subscript')}
        title="下付き文字"
      >
        <span className="text-xs">X<sub className="text-[8px]">2</sub></span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ========== 見出し ========== */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="見出し1"
      >
        <span className="text-xs font-bold">H1</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="見出し2"
      >
        <span className="text-xs font-bold">H2</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="見出し3"
      >
        <span className="text-xs font-bold">H3</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ========== 色 ========== */}
      <ColorPicker
        editor={editor}
        type="textColor"
        title="文字色"
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.246 14H8.754l-1.6 4H5l6-15h2l6 15h-2.154l-1.6-4Zm-.8-2L12 5.885 9.554 12h4.892ZM3 20h18v2H3v-2Z" />
          </svg>
        }
      />

      <ColorPicker
        editor={editor}
        type="highlight"
        title="背景色"
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.243 4.515l-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.829 1.04-1.041 2.122-.707 6.737-6.738-4.242-4.242zm6.364 3.536a1 1 0 0 1 0 1.414l-7.778 7.778-2.122.707-1.414 1.414a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414l1.414-1.414.707-2.121 7.778-7.778a1 1 0 0 1 1.414 0l5.657 5.657zM4 18h5.172l-1-1H5v-1H3v-1H1v5h3v-2z" />
          </svg>
        }
      />

      <ToolbarDivider />

      {/* ========== テキスト配置 ========== */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        title="左揃え"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 4h18v2H3V4Zm0 15h14v2H3v-2Zm0-5h18v2H3v-2Zm0-5h14v2H3V9Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        title="中央揃え"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 4h18v2H3V4Zm2 15h14v2H5v-2Zm-2-5h18v2H3v-2Zm2-5h14v2H5V9Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        title="右揃え"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 4h18v2H3V4Zm4 15h14v2H7v-2Zm-4-5h18v2H3v-2Zm4-5h14v2H7V9Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        isActive={editor.isActive({ textAlign: 'justify' })}
        title="両端揃え"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 4h18v2H3V4Zm0 15h18v2H3v-2Zm0-5h18v2H3v-2Zm0-5h18v2H3V9Z" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ========== リスト ========== */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="箇条書きリスト"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 4h13v2H8V4ZM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM8 11h13v2H8v-2Zm0 7h13v2H8v-2Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="番号付きリスト"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 4h13v2H8V4ZM5 3v3h1v1H3V6h1V4H3V3h2Zm-2 7h3.5v1H4v1h1.5v1H3v-4Zm2 9v-1H3v-1h3v4H3v-1h2Zm3-8h13v2H8v-2Zm0 7h13v2H8v-2Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title="タスクリスト"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v14h14V5H5Zm6.003 11L6.76 11.757l1.414-1.414 2.829 2.829 5.656-5.657 1.415 1.414L11.003 16Z" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ========== ブロック ========== */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="引用"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="コードブロック"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v14h16V5H4Zm16 7-3.536 3.536-1.414-1.415L17.172 12l-2.122-2.121 1.414-1.415L20 12ZM6.828 12l2.122 2.121-1.414 1.415L4 12l3.536-3.536L8.95 9.88 6.828 12Zm4.416 5H9.116l3.64-10h2.128l-3.64 10Z" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ========== リンク・メディア ========== */}
      <ToolbarButton
        onClick={() => {
          const previousUrl = editor.getAttributes('link').href || ''
          setLinkUrl(previousUrl)
          setIsLinkDialogOpen(true)
        }}
        isActive={editor.isActive('link')}
        title="リンク"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.364 15.536 16.95 14.12l1.414-1.414a5 5 0 1 0-7.071-7.071L9.879 7.05 8.464 5.636 9.88 4.222a7 7 0 0 1 9.9 9.9l-1.415 1.414Zm-2.828 2.828-1.415 1.414a7 7 0 0 1-9.9-9.9l1.415-1.414L7.05 9.88l-1.414 1.414a5 5 0 1 0 7.071 7.071l1.414-1.414 1.415 1.414Zm-.708-10.607 1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => setIsImageDialogOpen(true)}
        title="画像挿入"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.828 21l-.02.02-.021-.02H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H4.828ZM20 15V5H4v14L14 9l6 6Zm0 2.828-6-6L6.828 19H20v-1.172ZM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => setIsYoutubeDialogOpen(true)}
        title="YouTube動画"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.244 4c.534.003 1.87.016 3.29.073l.504.022c1.429.067 2.857.183 3.566.38.945.266 1.687 1.04 1.938 2.022.4 1.56.45 4.602.454 5.208v.59c-.004.606-.054 3.648-.454 5.208-.251.982-.993 1.756-1.938 2.022-.709.197-2.137.313-3.566.38l-.504.023c-1.42.056-2.756.07-3.29.072l-.488.001-.243-.001c-.534-.003-1.87-.016-3.29-.073l-.504-.022c-1.429-.067-2.857-.183-3.566-.38-.945-.266-1.687-1.04-1.938-2.022C2 16.242 2 12.2 2 12V11.8c0-.2 0-4.242.455-5.502.251-.982.993-1.756 1.938-2.022.709-.197 2.137-.313 3.566-.38l.504-.023C9.883 3.817 11.22 3.804 11.754 3.802L12 3.8l.244.2ZM10 15.464V8.536L16 12l-6 3.464Z" />
        </svg>
      </ToolbarButton>

      {/* テーブルメニュー */}
      <TableMenu editor={editor} />

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="水平線"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 11h2v2H2v-2Zm4 0h12v2H6v-2Zm14 0h2v2h-2v-2Z" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* ========== Undo/Redo ========== */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="元に戻す (Ctrl+Z)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.828 7l2.536 2.536L6.95 10.95 2 6l4.95-4.95 1.414 1.414L5.828 5H13a8 8 0 1 1 0 16H4v-2h9a6 6 0 1 0 0-12H5.828Z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="やり直し (Ctrl+Y)"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.172 7H11a6 6 0 1 0 0 12h9v2h-9a8 8 0 1 1 0-16h7.172l-2.536-2.536L17.05 1.05 22 6l-4.95 4.95-1.414-1.414L18.172 7Z" />
        </svg>
      </ToolbarButton>

      {/* ========== ダイアログ ========== */}

      {/* リンクダイアログ */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>リンクを挿入</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={setLink}>
              {linkUrl ? '設定' : 'リンク解除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 画像ダイアログ */}
      <ImageUploadDialog
        editor={editor}
        open={isImageDialogOpen}
        onOpenChange={setIsImageDialogOpen}
      />

      {/* YouTubeダイアログ */}
      <Dialog open={isYoutubeDialogOpen} onOpenChange={setIsYoutubeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>YouTube動画を挿入</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">YouTube URL</label>
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                YouTube動画のURLまたは共有URLを入力してください
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsYoutubeDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={addYoutube} disabled={!youtubeUrl}>
              挿入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
