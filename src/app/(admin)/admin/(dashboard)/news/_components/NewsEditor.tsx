"use client";

/**
 * お知らせエディター
 *
 * 本文（Lexical）と設定（メタデータ・SEO）を独立したフォーム・Server Action として管理する。
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/admin/components/ui";
import { EDITOR_PROSE_CLASSES } from "@/shared/lib/styles/prose";
import { CommentPanel } from "@/admin/components/editor/comment-panel";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import {
  EditorHeader,
  InlineEditorShell,
  SettingsDialog,
  useNewsEditor,
  useContentWidth,
  newsSettingsPanel,
  type NewsSidePanelExtra,
} from "@/admin/components/editor/inline";
import type { NewsData } from "@/shared/domain/news/types";
import type { ContentWidth } from "@/shared/types";

// =============================================================================
// Types
// =============================================================================

type NewsEditorProps = {
  news?: NewsData;
  mode?: "create" | "edit";
  /** グローバルレイアウト設定（フォールバック値として使用） */
  fallbackContentWidth?: ContentWidth;
};

// =============================================================================
// Component
// =============================================================================

export function NewsEditor({
  news,
  mode = "edit",
  fallbackContentWidth,
}: NewsEditorProps) {
  const editor = useNewsEditor({ news, mode });

  const publishActions =
    mode === "edit" && news
      ? {
          status: editor.isPublished,
          onPublish: editor.handlePublish,
          onUnpublish: editor.handleUnpublish,
        }
      : undefined;

  const deleteDialog =
    mode === "edit" && news ? (
      <Dialog
        open={editor.isDeleteDialogOpen}
        onOpenChange={editor.setIsDeleteDialogOpen}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={editor.isPending}
          >
            削除
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>お知らせを削除しますか？</DialogTitle>
            <DialogDescription>
              この操作は取り消せません。本当に削除してもよろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => editor.setIsDeleteDialogOpen(false)}
              disabled={editor.isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={editor.handleDelete}
              disabled={editor.isPending}
            >
              {editor.isPending ? "削除中..." : "削除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ) : undefined;

  const displaySlug = `news/${editor.slug}`;

  const contentWidthPx = useContentWidth({
    control: editor.settingsForm.control,
    widthFieldName: "contentWidth",
    customFieldName: "contentWidthCustom",
    fallback: fallbackContentWidth,
  });

  const sidePanelExtraProps = {
    isPublishedValue: editor.isPublished,
    onIsPublishedChange: (value: boolean) => {
      editor.settingsForm.setValue("isPublished", value, { shouldDirty: true });
    },
  } satisfies NewsSidePanelExtra;

  return (
    <>
      <InlineEditorShell
        onSave={editor.handleSave}
        isDirty={editor.isDirty}
        header={
          <EditorHeader
            title={editor.title}
            slug={displaySlug}
            isDirty={editor.isDirty}
            isPending={editor.isPending}
            metadataPanelLabel={newsSettingsPanel.title}
            onOpenSettings={editor.openSettingsDialog}
            onSave={editor.handleSave}
            onPreview={editor.handlePreview}
            onBack={editor.handleBack}
            publishActions={publishActions}
            showCommentButton={mode === "edit" && !!news}
            isCommentPanelOpen={editor.isCommentsPanelOpen}
            onToggleCommentPanel={editor.toggleComments}
            extraActions={deleteDialog}
          />
        }
      >
        <LazyLexicalEditor
          contentJson={editor.contentJson}
          onChange={editor.handleContentChange}
          disabled={editor.isPending}
          className={EDITOR_PROSE_CLASSES}
          showToolbar
          height="100%"
          onMarkClick={mode === "edit" && news ? editor.selectMark : undefined}
          onAddComment={
            mode === "edit" && news ? editor.handleAddComment : undefined
          }
          contentWidth={contentWidthPx ?? undefined}
          trailingPanel={
            mode === "edit" && news ? (
              <CommentPanel
                isOpen={editor.isCommentsPanelOpen}
                contentType="news"
                contentId={news.id}
                activeMarkId={editor.activeMarkId}
                onClose={editor.closeCommentsPanel}
                pendingComment={editor.pendingComment}
                onPendingCommentSubmit={editor.clearPendingComment}
              />
            ) : undefined
          }
        />
      </InlineEditorShell>

      <SettingsDialog
        open={editor.isSettingsDialogOpen}
        onOpenChange={(open) => {
          if (!open) editor.closeSettingsDialog();
        }}
        config={newsSettingsPanel}
        injected={{
          register: editor.settingsForm.register,
          control: editor.settingsForm.control,
          errors: editor.settingsForm.formState.errors,
          setValue: editor.settingsForm.setValue,
          getValues: editor.settingsForm.getValues,
          disabled: editor.isPending,
        }}
        extraProps={sidePanelExtraProps}
        onSave={editor.handleSaveSettings}
        onCancel={editor.closeSettingsDialog}
        isPending={editor.isPending}
        isDirty={editor.isSettingsDirty}
      />
    </>
  );
}
