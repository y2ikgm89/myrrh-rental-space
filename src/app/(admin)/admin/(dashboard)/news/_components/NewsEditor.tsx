"use client";

/**
 * お知らせエディター
 *
 * useNewsEditor専用フックを使用した型安全なエディター
 * 型アサーション完全排除
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
import { LazyLexicalEditor } from "@/admin/components/editor/lexical";
import {
  EditorHeader,
  InlineEditorShell,
  UnifiedSidePanel,
  useNewsEditor,
  useContentWidth,
  newsConfig,
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
  // 専用フック使用（型アサーション不要）
  const editor = useNewsEditor({ news, mode });

  // 公開アクションの設定
  const publishActions =
    mode === "edit" && news
      ? {
          status: editor.isPublished,
          onPublish: editor.handlePublish,
          onUnpublish: editor.handleUnpublish,
        }
      : undefined;

  // 削除ダイアログ
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

  // スラッグの表示
  const displaySlug = `news/${editor.slug}`;

  // コンテンツ幅（px）— エディタに渡すテキスト領域の幅
  const contentWidthPx = useContentWidth({
    control: editor.form.control,
    widthFieldName: "contentWidth",
    customFieldName: "contentWidthCustom",
    fallback: fallbackContentWidth,
  });

  // サイドパネル用extraProps
  const sidePanelExtraProps = {
    isPublishedValue: editor.isPublished,
    onIsPublishedChange: (value: boolean) => {
      editor.form.setValue("isPublished", value);
    },
  } satisfies NewsSidePanelExtra;

  return (
    <InlineEditorShell
      onSubmit={editor.form.handleSubmit(editor.onSubmit)}
      onSave={editor.handleSave}
      isDirty={editor.isDirty}
      isPanelOpen={editor.isPanelOpen}
      header={
        <EditorHeader
          title={editor.title}
          slug={displaySlug}
          isDirty={editor.isDirty}
          isPending={editor.isPending}
          isSidePanelOpen={editor.isSettingsPanelOpen}
          metadataPanelLabel={newsConfig.sidePanel.title}
          onToggleSidePanel={editor.toggleSettings}
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
      panel={
        <>
          <UnifiedSidePanel
            isOpen={editor.isSettingsPanelOpen}
            onClose={editor.closePanel}
            config={newsConfig.sidePanel}
            register={editor.form.register}
            control={editor.form.control}
            errors={editor.form.formState.errors}
            setValue={editor.form.setValue}
            getValues={editor.form.getValues}
            disabled={editor.isPending}
            extraProps={sidePanelExtraProps}
          />
          {mode === "edit" && news && (
            <CommentPanel
              isOpen={editor.isCommentsPanelOpen}
              contentType="news"
              contentId={news.id}
              activeMarkId={editor.activeMarkId}
              onClose={editor.closePanel}
              pendingComment={editor.pendingComment}
              onPendingCommentSubmit={editor.clearPendingComment}
            />
          )}
        </>
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
      />
    </InlineEditorShell>
  );
}
