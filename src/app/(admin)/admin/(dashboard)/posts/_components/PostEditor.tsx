"use client";

/**
 * 投稿エディター
 *
 * 本文（Lexical）は LexicalEditor、設定（メタデータ・分類・SEO）は SettingsDialog で
 * 独立したフォーム・Server Action として管理する。
 */

import { toast } from "sonner";
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
  usePostEditor,
  resolveContentWidthPx,
  postSettingsPanel,
  type PostSidePanelExtra,
} from "@/admin/components/editor/inline";
import {
  createPostCategory,
  createPostTag,
} from "@/admin/actions/post/taxonomy";
import type {
  PostCategoryData,
  PostData,
  PostTagData,
} from "@/shared/domain/posts/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { generateSlug } from "@/shared/lib/slug";
import type { ContentWidth } from "@/shared/types";

// =============================================================================
// Types
// =============================================================================

type PostEditorProps = {
  post?: PostData;
  categories: PostCategoryData[];
  tags: PostTagData[];
  mode?: "create" | "edit";
  /** グローバルレイアウト設定（フォールバック値として使用） */
  fallbackContentWidth?: ContentWidth;
};

// =============================================================================
// Component
// =============================================================================

export function PostEditor({
  post,
  categories,
  tags,
  mode = "edit",
  fallbackContentWidth,
}: PostEditorProps) {
  // カテゴリ/タグ作成ハンドラー
  const handleCreateCategory = async (name: string) => {
    const slug = generateSlug(name, "category");
    const result = await createPostCategory({
      name,
      slug,
      description: null,
      order: categories.length,
    });

    if (!isMutationError(result)) {
      toast.success("カテゴリを作成しました");
      return { id: result.id, name, slug };
    }
    toast.error(result.error);
    return null;
  };

  const handleCreateTag = async (name: string) => {
    const slug = generateSlug(name, "tag");
    const result = await createPostTag({ name, slug });

    if (!isMutationError(result)) {
      toast.success("タグを作成しました");
      return { id: result.id, name, slug };
    }
    toast.error(result.error);
    return null;
  };

  const editor = usePostEditor({
    post,
    mode,
    initialCategories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    })),
    initialTags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
    onCreateCategory: handleCreateCategory,
    onCreateTag: handleCreateTag,
  });

  // 公開アクションの設定
  const publishActions =
    mode === "edit" && post
      ? {
          status: editor.status,
          onPublish: editor.handlePublish,
          onUnpublish: editor.handleUnpublish,
        }
      : undefined;

  // 削除ダイアログ
  const deleteDialog =
    mode === "edit" && post ? (
      <Dialog
        open={editor.isDeleteDialogOpen}
        onOpenChange={editor.setIsDeleteDialogOpen}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={editor.isPending}
          >
            削除
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>投稿を削除しますか？</DialogTitle>
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
  const displaySlug = `posts/${editor.slug}`;

  // コンテンツ幅（px）— エディタに渡すテキスト領域の幅
  const contentWidthFieldValue = editor.settingsFields.contentWidth.value;
  const contentWidthCustomFieldValue =
    editor.settingsFields.contentWidthCustom.value;
  const contentWidthPx = resolveContentWidthPx({
    width:
      typeof contentWidthFieldValue === "string"
        ? contentWidthFieldValue
        : null,
    customPx:
      typeof contentWidthCustomFieldValue === "string"
        ? contentWidthCustomFieldValue
        : contentWidthCustomFieldValue != null
          ? String(contentWidthCustomFieldValue)
          : null,
    ...(fallbackContentWidth && { fallback: fallbackContentWidth }),
  });

  // SettingsDialog の extraProps
  const sidePanelExtraProps = {
    categories: editor.categories.map((c: { id: string; name: string }) => ({
      id: c.id,
      name: c.name,
    })),
    availableTags: editor.tags,
    onCreateCategory: editor.handleCreateCategory,
    onCreateTag: editor.handleCreateTag,
    statusValue: editor.status,
    onStatusChange: editor.handleStatusChange,
  } satisfies PostSidePanelExtra;

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
            metadataPanelLabel={postSettingsPanel.title}
            onOpenSettings={editor.openSettingsDialog}
            onSave={editor.handleSave}
            onPreview={editor.handlePreview}
            onBack={editor.handleBack}
            publishActions={publishActions}
            showCommentButton={mode === "edit" && !!post}
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
          flush
          height="100%"
          onMarkClick={mode === "edit" && post ? editor.selectMark : undefined}
          onAddComment={
            mode === "edit" && post ? editor.handleAddComment : undefined
          }
          contentWidth={contentWidthPx ?? undefined}
          trailingPanel={
            mode === "edit" && post ? (
              <CommentPanel
                isOpen={editor.isCommentsPanelOpen}
                contentType="post"
                contentId={post.id}
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
        config={postSettingsPanel}
        injected={{
          fields: editor.settingsFields,
          form: editor.settingsForm,
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
