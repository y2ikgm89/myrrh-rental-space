"use client";

/**
 * 投稿エディター
 *
 * usePostEditor専用フックを使用した型安全なエディター
 * 型アサーション完全排除
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
  UnifiedSidePanel,
  usePostEditor,
  useContentWidth,
  postConfig,
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
import { PostStatus } from "@generated/prisma/enums";
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

  // 専用フック使用（型アサーション不要）
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
  const contentWidthPx = useContentWidth({
    control: editor.form.control,
    widthFieldName: "contentWidth",
    customFieldName: "contentWidthCustom",
    fallback: fallbackContentWidth,
  });

  // サイドパネル用extraProps
  const sidePanelExtraProps = {
    categories: editor.categories.map((c: { id: string; name: string }) => ({
      id: c.id,
      name: c.name,
    })),
    availableTags: editor.tags,
    onCreateCategory: editor.handleCreateCategory,
    onCreateTag: editor.handleCreateTag,
    statusValue: editor.status,
    onStatusChange: (value: PostStatus) => {
      editor.form.setValue("status", value);
    },
  } satisfies PostSidePanelExtra;

  return (
    <InlineEditorShell
      onSubmit={editor.form.handleSubmit(editor.onSubmit)}
      onSave={editor.handleSave}
      isDirty={editor.isDirty}
      header={
        <EditorHeader
          title={editor.title}
          slug={displaySlug}
          isDirty={editor.isDirty}
          isPending={editor.isPending}
          isSidePanelOpen={editor.isSettingsPanelOpen}
          metadataPanelLabel={postConfig.sidePanel.title}
          onToggleSidePanel={editor.toggleSettings}
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
      panel={
        <>
          <UnifiedSidePanel
            isOpen={editor.isSettingsPanelOpen}
            onClose={editor.closePanel}
            config={postConfig.sidePanel}
            register={editor.form.register}
            control={editor.form.control}
            errors={editor.form.formState.errors}
            setValue={editor.form.setValue}
            getValues={editor.form.getValues}
            disabled={editor.isPending}
            extraProps={sidePanelExtraProps}
          />
          {mode === "edit" && post && (
            <CommentPanel
              isOpen={editor.isCommentsPanelOpen}
              contentType="post"
              contentId={post.id}
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
        onMarkClick={mode === "edit" && post ? editor.selectMark : undefined}
        onAddComment={
          mode === "edit" && post ? editor.handleAddComment : undefined
        }
        contentWidth={contentWidthPx ?? undefined}
      />
    </InlineEditorShell>
  );
}
