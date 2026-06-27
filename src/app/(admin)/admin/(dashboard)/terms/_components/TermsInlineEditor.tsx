"use client";

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
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";
import {
  EditorHeader,
  InlineEditorShell,
  SettingsDialog,
  useTermsEditor,
  termsSettingsPanel,
  resolveContentWidthPx,
  type TermsSidePanelExtra,
} from "@/admin/components/editor/inline";
import { TERMS_CONTENT_WIDTH } from "@/shared/lib/validations/terms";
import type { AdminTermsDetail } from "@/shared/domain/terms/admin-queries";

/**
 * エディタ本文の表示幅（px）。公開 `/terms/[slug]` と同じ {@link TERMS_CONTENT_WIDTH}
 * を解決し、執筆時のエディタ表示幅と公開結果の WYSIWYG を一致させる。
 */
const TERMS_EDITOR_CONTENT_WIDTH_PX = resolveContentWidthPx({
  width: TERMS_CONTENT_WIDTH,
  customPx: null,
});

// =============================================================================
// Types
// =============================================================================

type TermsInlineEditorProps = {
  terms?: AdminTermsDetail;
  mode: "create" | "edit";
  initialTemplateJson?: string;
  initialTitle?: string;
};

// =============================================================================
// Component
// =============================================================================

export function TermsInlineEditor({
  terms,
  mode,
  initialTemplateJson,
  initialTitle,
}: TermsInlineEditorProps) {
  const editor = useTermsEditor({
    mode,
    ...(terms && { terms }),
    ...(initialTemplateJson && { initialTemplateJson }),
    ...(initialTitle && { initialTitle }),
  });

  const publishActions =
    mode === "edit" && terms
      ? {
          status: editor.isPublished,
          onPublish: editor.handlePublish,
          onUnpublish: editor.handleUnpublish,
        }
      : undefined;

  const deleteDialog =
    mode === "edit" && terms ? (
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>規約を削除しますか？</DialogTitle>
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

  const displaySlug = `terms/${editor.slug}`;

  const sidePanelExtraProps = {
    typeValue: editor.type,
    onTypeChange: editor.handleTypeChange,
    isPublishedValue: editor.isPublished,
    onIsPublishedChange: editor.handleIsPublishedChange,
    scopesValue: editor.scopes,
    onScopesChange: editor.handleScopesChange,
    changelogValue: editor.changelog,
    onChangelogChange: editor.handleChangelogChange,
    showInFooterValue: editor.showInFooter,
    onShowInFooterChange: editor.handleShowInFooterChange,
  } satisfies TermsSidePanelExtra;

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
            metadataPanelLabel={termsSettingsPanel.title}
            onOpenSettings={editor.openSettingsDialog}
            onSave={editor.handleSave}
            onPreview={editor.handlePreview}
            onBack={editor.handleBack}
            publishActions={publishActions}
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
          {...(TERMS_EDITOR_CONTENT_WIDTH_PX != null && {
            contentWidth: TERMS_EDITOR_CONTENT_WIDTH_PX,
          })}
        />
      </InlineEditorShell>

      <SettingsDialog
        open={editor.isSettingsDialogOpen}
        onOpenChange={(open) => {
          if (!open) editor.closeSettingsDialog();
        }}
        config={termsSettingsPanel}
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
