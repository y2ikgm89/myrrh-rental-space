/**
 * Lexical Editor
 *
 * @description リッチテキストエディタのメインコンポーネント
 *
 * 非制御コンポーネント設計: EditorStateを親で管理せず、
 * onChangeでHTML形式のコンテンツを返す
 */

'use client'

import { useEffect, useEffectEvent, useState } from 'react'
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
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin'
import { CharacterLimitPlugin } from '@lexical/react/LexicalCharacterLimitPlugin'
import type { EditorState, LexicalEditor as LexicalEditorType } from 'lexical'

import { useMediaQuery } from '@/shared/hooks'
import { cn } from '@/shared/lib/utils'
import { EDITOR_TRANSFORMERS } from './MarkdownTransformers'
import { EDITOR_NODES } from './config/nodes'
import { MATCHERS, validateUrl } from './config/url-matchers'
import { HtmlInitializerPlugin } from './internal-plugins/HtmlInitializerPlugin'
import { DisablePlugin } from './internal-plugins/DisablePlugin'
import { useDialogManager } from './dialogs/use-dialog-manager'
import { DialogRenderer } from './dialogs/DialogRenderer'
import {
  ToolbarPlugin,
  ComponentPickerPlugin,
  DraggableBlockPlugin,
  FloatingToolbarPlugin,
  LinkHoverPreviewPlugin,
  CommentPlugin,
  PageBreakPlugin,
  CollapsiblePlugin,
  EmojiPickerPlugin,
  TableOfContentsPlugin,
  KeyboardShortcutsPlugin,
  CodeBlockPlugin,
  useComment,
} from './plugins'
import { WordCountPlugin, useWordCount } from './plugins/WordCountPlugin'
import { AutoSavePlugin, useAutoSaveStatus } from './plugins/AutoSavePlugin'
import { ImageDropPlugin } from './plugins/ImageDropPlugin'
import { PasteUrlPlugin } from './plugins/PasteUrlPlugin'
import { FindReplacePlugin } from './plugins/FindReplacePlugin'
import { BlockTemplatePlugin } from './plugins/BlockTemplatePlugin'
import { TableActionMenuPlugin } from './plugins'
import { StatusBar } from './parts/StatusBar'
import { editorTheme } from './theme'
import { InspectorSidebar } from './inspector'
import { MobileEditorFallback } from './parts/MobileEditorFallback'
import { logger } from '@/shared/lib/logger'
import type { LexicalEditorProps } from './types'

// =============================================================================
// EditorInner - LexicalComposer内で使用
// =============================================================================

function EditorInner({
  contentJson,
  contentHtml,
  onChange,
  disabled = false,
  className,
  showToolbar = true,
  showInspector = true,
  height = '300px',
  placeholder = 'ここに内容を入力...',
  onMarkClick,
  onAddComment,
  contentWidthClassName,
  contentWidthStyle,
  onAutoSave,
  autoSaveKey,
  characterLimit,
}: LexicalEditorProps) {
  const [contentWrapperRef, setContentWrapperRef] = useState<HTMLDivElement | null>(null)
  const [contentWidthRef, setContentWidthRef] = useState<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleEsc = useEffectEvent(() => setIsFullscreen(false))
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleEsc()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isFullscreen])

  // ダイアログ管理（13個の個別フック → 単一マネージャー）
  const dialogManager = useDialogManager()

  // 文字数カウント
  const { wordCountData, updateWordCount } = useWordCount()

  // オートセーブ
  const { saveStatus, setSaveStatus } = useAutoSaveStatus()

  // コメント機能
  const { canAddComment, addComment } = useComment()

  const handleAddComment = () => {
    if (!canAddComment || !onAddComment) return
    const payload = addComment()
    if (payload) {
      onAddComment(payload)
    }
  }

  // コンテンツ変更ハンドラ（JSON出力）
  const handleChange = (editorState: EditorState, _editor: LexicalEditorType) => {
    if (!onChange) return
    const json = JSON.stringify(editorState.toJSON())
    onChange(json)
  }

  return (
    <div className={cn("flex h-full", isFullscreen && "fixed inset-0 z-[100]")}>
      {/* メインエディタ部分 */}
      <div
        className={cn(
          'flex flex-col flex-1 bg-background border rounded-lg overflow-hidden min-w-0',
          isFullscreen && 'rounded-none border-0',
        )}
        style={isFullscreen ? undefined : { height }}
      >
        {/* ツールバー */}
        {showToolbar && (
          <div className="shrink-0">
            <ToolbarPlugin openDialog={dialogManager.openDialog} isFullscreen={isFullscreen} onFullscreenToggle={() => setIsFullscreen((prev) => !prev)} />
          </div>
        )}

        {/* コンテンツラッパー */}
        <div ref={setContentWrapperRef} className="flex-1 overflow-y-auto">
          <div
            ref={setContentWidthRef}
            className={cn('relative', contentWidthClassName)}
            style={contentWidthStyle}
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-placeholder={placeholder}
                  placeholder={
                    <div className="pointer-events-none absolute top-6 left-10 text-muted-foreground">
                      {placeholder}
                    </div>
                  }
                  className={`outline-none pl-10 pr-6 py-6 min-h-full ${className ?? ''}`}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
        </div>

        {/* 公式プラグイン */}
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />
        <LinkPlugin validateUrl={validateUrl} />
        <AutoLinkPlugin matchers={MATCHERS} />
        <ClickableLinkPlugin />
        <TabIndentationPlugin />
        <MarkdownShortcutPlugin transformers={EDITOR_TRANSFORMERS} />
        <HorizontalRulePlugin />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />

        {/* カスタムプラグイン */}
        {/* contentJson がない場合のみ HTML フォールバック初期化 */}
        {!contentJson && <HtmlInitializerPlugin content={contentHtml} />}
        <DisablePlugin disabled={disabled} />
        <DraggableBlockPlugin anchorElem={contentWidthRef} />
        <TableActionMenuPlugin anchorElem={contentWidthRef} />
        {contentWrapperRef && (
          <FloatingToolbarPlugin
            anchorElem={contentWrapperRef}
            setIsLinkEditMode={(isEditMode) => {
              if (isEditMode) dialogManager.openDialog('link')
            }}
            onAddComment={onAddComment ? handleAddComment : undefined}
            onOpenRuby={() => dialogManager.openDialog('ruby')}
            onOpenTooltip={() => dialogManager.openDialog('tooltip')}
          />
        )}
        <LinkHoverPreviewPlugin />
        <CommentPlugin onMarkClick={onMarkClick} />
        <PageBreakPlugin />
        <ComponentPickerPlugin openDialog={dialogManager.openDialog} />
        <ImageDropPlugin />
        <PasteUrlPlugin />
        <FindReplacePlugin anchorElem={contentWrapperRef} />
        <TableOfContentsPlugin />
        <KeyboardShortcutsPlugin openDialog={dialogManager.openDialog} />
        <CodeBlockPlugin anchorElem={contentWrapperRef} />
        {(onAutoSave ?? autoSaveKey) && (
          <AutoSavePlugin
            onAutoSave={onAutoSave}
            autoSaveKey={autoSaveKey}
            onStatusChange={setSaveStatus}
          />
        )}

        {/* ブロックテンプレート */}
        <BlockTemplatePlugin
          isSaveOpen={dialogManager.activeDialog === 'blockTemplateSave'}
          isInsertOpen={dialogManager.activeDialog === 'blockTemplateInsert'}
          onClose={dialogManager.closeDialog}
        />

        {/* ダイアログ */}
        <DialogRenderer dialogManager={dialogManager} />
        <CollapsiblePlugin />
        <EmojiPickerPlugin />
        <WordCountPlugin onUpdate={updateWordCount} />
        {characterLimit !== undefined && (
          <CharacterLimitPlugin charset="UTF-16" maxLength={characterLimit} />
        )}

        {/* ステータスバー */}
        <StatusBar wordCount={wordCountData} saveStatus={saveStatus} />
      </div>

      {/* インスペクターサイドバー */}
      {showInspector && <InspectorSidebar />}
    </div>
  )
}

// =============================================================================
// LexicalEditor - メインコンポーネント
// =============================================================================

export function LexicalEditor(props: LexicalEditorProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // モバイルデバイスでは読み取り専用フォールバック
  // コンポーネント境界で分離し、モバイルでは Lexical 初期化コストを完全回避
  if (!isDesktop) {
    return <MobileEditorFallback contentHtml={props.contentHtml} height={props.height} />
  }

  return <LexicalEditorDesktop {...props} />
}

// =============================================================================
// LexicalEditorDesktop - デスクトップ専用（Lexical初期化）
// =============================================================================

function LexicalEditorDesktop(props: LexicalEditorProps) {
  // useState lazy initializer: 初回マウント時のみ実行（非制御コンポーネント設計）
  // contentJson は初期値としてのみ使用。以降の props.contentJson 変更は無視される
  const [initialConfig] = useState(() => ({
    namespace: 'LexicalEditor',
    theme: editorTheme,
    nodes: [...EDITOR_NODES],
    ...(props.contentJson ? { editorState: props.contentJson } : {}),
    onError: (error: Error) => {
      logger.error('Lexical initialization error', { error: error.message })
    },
  }))

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorInner {...props} />
    </LexicalComposer>
  )
}
