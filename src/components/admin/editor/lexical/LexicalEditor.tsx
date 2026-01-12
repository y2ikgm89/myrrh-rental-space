/**
 * Lexical Editor
 *
 * Lexicalベースのリッチテキストエディタ
 * Next.js 16 / React 19 / React Compiler対応
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin as LexicalLinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { TablePlugin as LexicalTablePlugin } from '@lexical/react/LexicalTablePlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, $insertNodes, type EditorState } from 'lexical'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table'
import { tv } from 'tailwind-variants'

import { editorTheme } from './theme'
import type { LexicalEditorProps } from './types'
import { ImageNode, YouTubeNode, PostListWidgetNode } from './nodes'
import {
  ToolbarPlugin,
  FloatingToolbarPlugin,
  ImagePlugin,
  useImageDialog,
  YouTubePlugin,
  useYouTubeDialog,
  PostListWidgetPlugin,
  usePostListWidgetDialog,
  useLinkDialog,
  useTableDialog,
} from './plugins'

const styles = tv({
  slots: {
    wrapper: 'border rounded-lg overflow-hidden bg-background',
    editorContainer: 'relative',
    contentEditable: [
      'outline-none p-4',
      'prose prose-sm max-w-none',
      'prose-headings:font-bold prose-headings:text-foreground',
      'prose-p:text-foreground prose-p:leading-relaxed',
      'prose-a:text-primary prose-a:underline',
      'prose-strong:text-foreground prose-strong:font-bold',
      'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm',
      'prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg',
      'prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic',
      'prose-ul:list-disc prose-ol:list-decimal',
      'prose-img:rounded-lg prose-img:max-w-full',
      'prose-table:border-collapse prose-th:border prose-th:p-2 prose-th:bg-muted prose-td:border prose-td:p-2',
    ],
    placeholder: 'absolute top-4 left-4 text-muted-foreground pointer-events-none',
    characterCount: 'px-4 py-2 text-xs text-muted-foreground border-t text-right',
  },
  variants: {
    disabled: {
      true: {
        wrapper: 'opacity-50 cursor-not-allowed',
        contentEditable: 'pointer-events-none',
      },
    },
  },
})()

function Placeholder({ text }: { text: string }) {
  return <div className={styles.placeholder()}>{text}</div>
}

type InitialContentPluginProps = {
  content?: string
}

function InitialContentPlugin({ content }: InitialContentPluginProps) {
  const [editor] = useLexicalComposerContext()
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (isInitializedRef.current || !content) {
      return
    }

    isInitializedRef.current = true

    editor.update(() => {
      const parser = new DOMParser()
      const dom = parser.parseFromString(content, 'text/html')
      const nodes = $generateNodesFromDOM(editor, dom)
      const root = $getRoot()
      root.clear()
      $insertNodes(nodes)
    })
  }, [editor, content])

  return null
}

type CharacterCountPluginProps = {
  limit?: number
}

function CharacterCountPlugin({ limit }: CharacterCountPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [count, setCount] = useState(0)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot()
        const text = root.getTextContent()
        setCount(text.length)
      })
    })
  }, [editor])

  if (!limit) {
    return null
  }

  const isOverLimit = count > limit

  return (
    <div
      className={`${styles.characterCount()} ${
        isOverLimit ? 'text-destructive' : ''
      }`}
    >
      {count.toLocaleString()} / {limit.toLocaleString()}
    </div>
  )
}

function OnChangeHandler({
  onChange,
}: {
  onChange?: (html: string) => void
}) {
  const [editor] = useLexicalComposerContext()

  const handleChange = useCallback(
    (editorState: EditorState) => {
      if (!onChange) return

      editorState.read(() => {
        const html = $generateHtmlFromNodes(editor, null)
        onChange(html)
      })
    },
    [editor, onChange]
  )

  return <OnChangePlugin onChange={handleChange} />
}

/**
 * Inner Editor Component
 * This component is rendered inside LexicalComposer and can use the context hooks
 */
type EditorInnerProps = {
  content?: string
  onChange?: (html: string) => void
  placeholder: string
  disabled: boolean
  className?: string
  characterLimit?: number
  minHeight: string
  showToolbar: boolean
  showFloatingToolbar: boolean
}

function EditorInner({
  content,
  onChange,
  placeholder,
  disabled,
  className,
  characterLimit,
  minHeight,
  showToolbar,
  showFloatingToolbar,
}: EditorInnerProps) {
  // These hooks must be called inside LexicalComposer
  const { openImageDialog, ImageDialog } = useImageDialog()
  const { openYouTubeDialog, YouTubeDialog } = useYouTubeDialog()
  const { openPostListWidgetDialog, PostListWidgetDialog } = usePostListWidgetDialog()
  const { openLinkDialog, LinkDialog } = useLinkDialog()
  const { openTableDialog, TableDialog } = useTableDialog()

  return (
    <div className={`${styles.wrapper({ disabled })} ${className || ''}`}>
      {showToolbar && (
        <ToolbarPlugin
          disabled={disabled}
          onInsertImage={openImageDialog}
          onInsertVideo={openYouTubeDialog}
          onInsertLink={openLinkDialog}
          onInsertTable={openTableDialog}
          onInsertWidget={openPostListWidgetDialog}
        />
      )}

      <div className={styles.editorContainer()}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={styles.contentEditable()}
              style={{ minHeight }}
              aria-placeholder={placeholder}
              placeholder={<Placeholder text={placeholder} />}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>

      <CharacterCountPlugin limit={characterLimit} />

      {/* Plugins */}
      <InitialContentPlugin content={content} />
      <OnChangeHandler onChange={onChange} />
      <HistoryPlugin />
      <ListPlugin />
      <LexicalLinkPlugin />
      <LexicalTablePlugin />
      <TabIndentationPlugin />
      <ImagePlugin />
      <YouTubePlugin />
      <PostListWidgetPlugin />

      {showFloatingToolbar && <FloatingToolbarPlugin />}

      {/* Dialogs */}
      <ImageDialog />
      <YouTubeDialog />
      <PostListWidgetDialog />
      <LinkDialog />
      <TableDialog />
    </div>
  )
}

export function LexicalEditor({
  content,
  onChange,
  placeholder = '本文を入力...',
  disabled = false,
  className,
  characterLimit,
  minHeight = '300px',
  showToolbar = true,
  showFloatingToolbar = true,
}: LexicalEditorProps) {
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
        TableNode,
        TableCellNode,
        TableRowNode,
        ImageNode,
        YouTubeNode,
        PostListWidgetNode,
      ],
      onError: (error: Error) => {
        console.error('Lexical Editor Error:', error)
      },
      editable: !disabled,
    }),
    [disabled]
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorInner
        content={content}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        characterLimit={characterLimit}
        minHeight={minHeight}
        showToolbar={showToolbar}
        showFloatingToolbar={showFloatingToolbar}
      />
    </LexicalComposer>
  )
}

export default LexicalEditor
