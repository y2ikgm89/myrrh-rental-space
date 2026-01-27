'use client'

/**
 * ページエディター
 *
 * usePageEditor専用フックを使用した型安全なエディター
 * 型アサーション完全排除
 */

import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { CommentPanel } from '@/admin/components/editor/comment-panel'
import { LazyLexicalEditor } from '@/admin/components/editor/lexical'
import {
  EditorHeader,
  InlineEditorShell,
  UnifiedSidePanel,
  usePageEditor,
  useContentWidthStyles,
  pageConfig,
} from '@/admin/components/editor/inline'
import type { PageData } from '@/admin/lib/validations/page'

// =============================================================================
// Types
// =============================================================================

type PageEditorProps = {
  page: PageData
}

// =============================================================================
// Component
// =============================================================================

export function PageEditor({ page }: PageEditorProps) {
  // 専用フック使用（型アサーション不要）
  const editor = usePageEditor({ page })

  // コンテンツ幅スタイル（useWatch公式パターン）
  const contentStyles = useContentWidthStyles({ control: editor.form.control })

  // サイドパネル用extraProps
  const sidePanelExtraProps = {
    isPublishedValue: editor.isPublished,
    onIsPublishedChange: (value: boolean) => {
      editor.form.setValue('isPublished', value)
    },
  }

  return (
    <InlineEditorShell
      onSubmit={editor.form.handleSubmit(editor.onSubmit)}
      onSave={editor.handleSave}
      isDirty={editor.isDirty}
      isPanelOpen={editor.isPanelOpen}
      header={
        <EditorHeader
          title={editor.title}
          slug={editor.slug}
          isDirty={editor.isDirty}
          isPending={editor.isPending}
          isSidePanelOpen={editor.isSettingsPanelOpen}
          onToggleSidePanel={editor.toggleSettings}
          onSave={editor.handleSave}
          onPreview={editor.handlePreview}
          onBack={editor.handleBack}
          showCommentButton
          isCommentPanelOpen={editor.isCommentsPanelOpen}
          onToggleCommentPanel={editor.toggleComments}
        />
      }
      panel={
        <>
          <UnifiedSidePanel
            isOpen={editor.isSettingsPanelOpen}
            onClose={editor.closePanel}
            config={pageConfig.sidePanel}
            register={editor.form.register}
            control={editor.form.control}
            errors={editor.form.formState.errors}
            setValue={editor.form.setValue}
            getValues={editor.form.getValues}
            disabled={editor.isPending}
            extraProps={sidePanelExtraProps}
          />
          <CommentPanel
            isOpen={editor.isCommentsPanelOpen}
            contentType="page"
            contentId={page.id}
            activeMarkId={editor.activeMarkId}
            onClose={editor.closePanel}
            pendingComment={editor.pendingComment}
            onPendingCommentSubmit={editor.clearPendingComment}
          />
        </>
      }
    >
      <LazyLexicalEditor
        content={editor.content}
        onChange={editor.handleContentChange}
        disabled={editor.isPending}
        className={EDITOR_PROSE_CLASSES}
        showToolbar
        height="100%"
        onMarkClick={editor.selectMark}
        onAddComment={editor.handleAddComment}
        contentWidthClassName={contentStyles.className}
        contentWidthStyle={contentStyles.style}
      />
    </InlineEditorShell>
  )
}
