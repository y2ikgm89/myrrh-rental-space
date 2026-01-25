/**
 * Lexical Editor
 *
 * @description リッチテキストエディタのメインコンポーネント
 *
 * 非制御コンポーネント設計: EditorStateを親で管理せず、
 * onChangeでHTML形式のコンテンツを返す
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'

import { EDITOR_TRANSFORMERS } from './MarkdownTransformers'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode'
import { $getRoot, $insertNodes, type EditorState, type LexicalEditor as LexicalEditorType } from 'lexical'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListItemNode, ListNode } from '@lexical/list'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { MarkNode } from '@lexical/mark'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { ImageNode } from './nodes/ImageNode'
import { YouTubeNode } from './nodes/YouTubeNode'
import { XNode } from './nodes/XNode'
import { LayoutContainerNode } from './nodes/LayoutContainerNode'
import { LayoutItemNode } from './nodes/LayoutItemNode'
import {
  ToolbarPlugin,
  ImagePlugin,
  YouTubePlugin,
  XPlugin,
  LinkDialogPlugin,
  TableInsertPlugin,
  LayoutPlugin,
  ComponentPickerPlugin,
  DraggableBlockPlugin,
  FloatingToolbarPlugin,
  CommentPlugin,
  useImageDialog,
  useYouTubeDialog,
  useXDialog,
  useLinkDialog,
  useTableDialog,
  useLayoutDialog,
  useComment,
} from './plugins'
import { editorTheme } from './theme'
import type { LexicalEditorProps } from './types'

// =============================================================================
// AutoLink URL Matcher
// =============================================================================

const URL_MATCHER =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/

const EMAIL_MATCHER =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/

const MATCHERS = [
  (text: string) => {
    const match = URL_MATCHER.exec(text)
    if (match === null) {
      return null
    }
    const fullMatch = match[0]
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: fullMatch.startsWith('http') ? fullMatch : `https://${fullMatch}`,
    }
  },
  (text: string) => {
    const match = EMAIL_MATCHER.exec(text)
    if (match === null) {
      return null
    }
    const fullMatch = match[0]
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: `mailto:${fullMatch}`,
    }
  },
]

// =============================================================================
// URL Validation
// =============================================================================

/**
 * URLの妥当性を検証する
 *
 * @param url - 検証対象のURL
 * @returns 有効なURLの場合true
 */
function validateUrl(url: string): boolean {
  // 空文字はfalse
  if (!url) return false

  // mailto: と tel: は許可
  if (url.startsWith('mailto:') || url.startsWith('tel:')) {
    return true
  }

  // 相対パスは許可
  if (url.startsWith('/') || url.startsWith('#')) {
    return true
  }

  // URL形式のチェック
  try {
    new URL(url)
    return true
  } catch {
    // http:// や https:// が付いていない場合に補完して再チェック
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      try {
        new URL(`https://${url}`)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

// =============================================================================
// HTMLからノードへの変換プラグイン
// =============================================================================

function HtmlInitializerPlugin({
  content,
  editorRef,
}: {
  content?: string
  editorRef: React.MutableRefObject<LexicalEditorType | null>
}) {
  const [editor] = useLexicalComposerContext()
  const hasInitialized = useRef(false)

  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])

  useEffect(() => {
    if (hasInitialized.current || !content) return

    try {
      editor.update(() => {
        const parser = new DOMParser()
        const dom = parser.parseFromString(content, 'text/html')
        const nodes = $generateNodesFromDOM(editor, dom)
        const root = $getRoot()
        root.clear()
        $insertNodes(nodes)
      })
    } catch (error) {
      console.error('Failed to parse HTML content:', error)
    }

    hasInitialized.current = true
  }, [editor, content])

  return null
}

// =============================================================================
// 編集無効化プラグイン
// =============================================================================

function DisablePlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [editor, disabled])

  return null
}

// =============================================================================
// EditorInner - LexicalComposer内で使用
// =============================================================================

function EditorInner({
  content,
  onChange,
  disabled = false,
  className,
  showToolbar = true,
  height = '300px',
  placeholder = 'ここに内容を入力...',
  onMarkClick,
  onAddComment,
}: LexicalEditorProps) {
  const editorRef = useRef<LexicalEditorType | null>(null)
  const [contentWrapperRef, setContentWrapperRef] = useState<HTMLDivElement | null>(null)

  // 画像ダイアログ
  const { isImageDialogOpen, openImageDialog, closeImageDialog } =
    useImageDialog()

  // YouTubeダイアログ
  const { isYouTubeDialogOpen, openYouTubeDialog, closeYouTubeDialog } =
    useYouTubeDialog()

  // Xダイアログ
  const { isXDialogOpen, openXDialog, closeXDialog } = useXDialog()

  // リンクダイアログ
  const { isLinkDialogOpen, openLinkDialog, closeLinkDialog } =
    useLinkDialog()

  // テーブルダイアログ
  const { isTableDialogOpen, openTableDialog, closeTableDialog } =
    useTableDialog()

  // レイアウトダイアログ
  const { isLayoutDialogOpen, openLayoutDialog, closeLayoutDialog } =
    useLayoutDialog()

  // コメント機能
  const { canAddComment, addComment } = useComment()

  // コメント追加ハンドラ
  const handleAddComment = () => {
    if (!canAddComment || !onAddComment) return
    const payload = addComment()
    if (payload) {
      onAddComment(payload)
    }
  }

  // コンテンツ変更ハンドラ
  const handleChange = (editorState: EditorState, editor: LexicalEditorType) => {
    if (!onChange) return

    editorState.read(() => {
      const html = $generateHtmlFromNodes(editor, null)
      onChange(html)
    })
  }

  return (
    <div
      className="flex flex-col rounded-lg border bg-background"
      style={{ height }}
    >
      {/* ツールバー - 固定（スクロールしない） */}
      {showToolbar && (
        <div className="shrink-0">
          <ToolbarPlugin
            onInsertImage={openImageDialog}
            onInsertYouTube={openYouTubeDialog}
            onInsertX={openXDialog}
            onInsertLink={openLinkDialog}
            onInsertTable={openTableDialog}
            onInsertLayout={openLayoutDialog}
          />
        </div>
      )}

      {/* コンテンツラッパー - スクロール可能 */}
      <div ref={setContentWrapperRef} className="relative flex-1 overflow-y-auto">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={`outline-none pl-8 pr-4 py-3 min-h-full ${className ?? ''}`}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute top-3 left-8 text-muted-foreground">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>

      {/* 公式プラグイン */}
      <HistoryPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <TablePlugin />
      <LinkPlugin validateUrl={validateUrl} />
      <AutoLinkPlugin matchers={MATCHERS} />
      <ClickableLinkPlugin />
      <TabIndentationPlugin />
      <MarkdownShortcutPlugin transformers={EDITOR_TRANSFORMERS} />
      <HorizontalRulePlugin />
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange />

      {/* カスタムプラグイン */}
      <HtmlInitializerPlugin content={content} editorRef={editorRef} />
      <DisablePlugin disabled={disabled} />
      <DraggableBlockPlugin anchorElem={contentWrapperRef} />
      {contentWrapperRef && (
        <FloatingToolbarPlugin
          anchorElem={contentWrapperRef}
          setIsLinkEditMode={(isEditMode) => {
            if (isEditMode) openLinkDialog()
          }}
          onAddComment={onAddComment ? handleAddComment : undefined}
        />
      )}
      <CommentPlugin onMarkClick={onMarkClick} />
      <ComponentPickerPlugin
        onInsertImage={openImageDialog}
        onInsertYouTube={openYouTubeDialog}
        onInsertX={openXDialog}
        onInsertTable={openTableDialog}
        onInsertLayout={openLayoutDialog}
      />

      {/* ダイアログ */}
      <ImagePlugin isOpen={isImageDialogOpen} onClose={closeImageDialog} />
      <YouTubePlugin isOpen={isYouTubeDialogOpen} onClose={closeYouTubeDialog} />
      <XPlugin isOpen={isXDialogOpen} onClose={closeXDialog} />
      <LinkDialogPlugin isOpen={isLinkDialogOpen} onClose={closeLinkDialog} />
      <TableInsertPlugin isOpen={isTableDialogOpen} onClose={closeTableDialog} />
      <LayoutPlugin isOpen={isLayoutDialogOpen} onClose={closeLayoutDialog} />
    </div>
  )
}

// =============================================================================
// LexicalEditor - メインコンポーネント
// =============================================================================

export function LexicalEditor(props: LexicalEditorProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: 'LexicalEditor',
      theme: editorTheme,
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        LinkNode,
        AutoLinkNode,
        CodeNode,
        CodeHighlightNode,
        ImageNode,
        YouTubeNode,
        XNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        HorizontalRuleNode,
        LayoutContainerNode,
        LayoutItemNode,
        MarkNode,
      ],
      onError: (error: Error) => {
        console.error('Lexical Error:', error)
      },
    }),
    []
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorInner {...props} />
    </LexicalComposer>
  )
}
