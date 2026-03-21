/**
 * Lexical Editor
 *
 * @description リッチテキストエディタのメインコンポーネント
 *
 * 非制御コンポーネント設計: EditorStateを親で管理せず、
 * onChange で EditorState JSON 文字列を返す
 */

"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { AutoLinkPlugin } from "@lexical/react/LexicalAutoLinkPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { CharacterLimitPlugin } from "@lexical/react/LexicalCharacterLimitPlugin";
import type { EditorState, LexicalEditor as LexicalEditorType } from "lexical";
import { AlertCircle } from "lucide-react";

import { useMediaQuery } from "@/shared/hooks";
import { isLexicalComposerReadyEditorStateJson } from "@/shared/lib/validations/lexical";
import { cn } from "@/shared/lib/cn";
import { EDITOR_TRANSFORMERS } from "./MarkdownTransformers";
import { EDITOR_NODES } from "./config/nodes";
import { MATCHERS, validateUrl } from "./config/url-matchers";
import { DisablePlugin } from "./internal-plugins/DisablePlugin";
import { useDialogManager } from "./dialogs/use-dialog-manager";
import { DialogRenderer } from "./dialogs/DialogRenderer";
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
} from "./plugins";
import { WordCountPlugin, useWordCount } from "./plugins/WordCountPlugin";
import { AutoSavePlugin, useAutoSaveStatus } from "./plugins/AutoSavePlugin";
import { ImageDropPlugin } from "./plugins/ImageDropPlugin";
import { PasteUrlPlugin } from "./plugins/PasteUrlPlugin";
import { FindReplacePlugin } from "./plugins/FindReplacePlugin";
import { BlockTemplatePlugin } from "./plugins/BlockTemplatePlugin";
import { TableActionMenuPlugin } from "./plugins";
import { StatusBar } from "./parts/StatusBar";
import { editorTheme } from "./theme";
import { InspectorSidebar, InspectorSidebarProvider } from "./inspector";
import { MobileEditorFallback } from "./parts/MobileEditorFallback";
import { logger } from "@/shared/lib/logger";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import type { LexicalEditorProps } from "./types";
import { EDITOR_PADDING_HORIZONTAL } from "./editor-layout-constants";

// =============================================================================
// EditorInner - LexicalComposer内で使用
// =============================================================================

function EditorInner({
  onChange,
  disabled = false,
  className,
  showToolbar = true,
  showInspector = true,
  height = "300px",
  placeholder = "ここに内容を入力...",
  onMarkClick,
  onAddComment,
  contentWidth,
  onAutoSave,
  autoSaveKey,
  characterLimit,
}: Omit<LexicalEditorProps, "contentJson">) {
  const [contentWrapperRef, setContentWrapperRef] =
    useState<HTMLDivElement | null>(null);
  const [contentWidthRef, setContentWidthRef] = useState<HTMLDivElement | null>(
    null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleEsc = useEffectEvent(() => setIsFullscreen(false));
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleEsc();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // ダイアログ管理（13個の個別フック → 単一マネージャー）
  const dialogManager = useDialogManager();

  // 文字数カウント
  const { wordCountData, updateWordCount } = useWordCount();

  // オートセーブ
  const { saveStatus, setSaveStatus } = useAutoSaveStatus();

  // コメント機能
  const { canAddComment, addComment } = useComment();

  const handleAddComment = () => {
    if (!canAddComment || !onAddComment) return;
    const payload = addComment();
    if (payload) {
      onAddComment(payload);
    }
  };

  // コンテンツ変更ハンドラ（JSON出力）
  const handleChange = (
    editorState: EditorState,
    _editor: LexicalEditorType,
  ) => {
    if (!onChange) return;
    const json = JSON.stringify(editorState.toJSON());
    onChange(json);
  };

  const inspectorEnabled = showInspector !== false;

  return (
    <InspectorSidebarProvider enabled={inspectorEnabled}>
      <div
        className={cn(
          "flex h-full min-h-0",
          isFullscreen && `fixed inset-0 z-[${Z_INDEX.editorFullscreen}]`,
        )}
      >
        {/* メインエディタ部分 */}
        <section
          aria-label="本文エディタ"
          className={cn(
            "flex flex-col flex-1 bg-background border border-border rounded-lg overflow-hidden min-w-0 min-h-0",
            isFullscreen && "rounded-none border-0",
          )}
          style={isFullscreen ? undefined : { height }}
        >
          {/* ツールバー */}
          {showToolbar && (
            <div className="shrink-0">
              <ToolbarPlugin
                openDialog={dialogManager.openDialog}
                isFullscreen={isFullscreen}
                onFullscreenToggle={() => setIsFullscreen((prev) => !prev)}
              />
            </div>
          )}

          {/* コンテンツラッパー */}
          <div
            ref={setContentWrapperRef}
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <div
              ref={setContentWidthRef}
              className={cn("relative", contentWidth != null && "mx-auto")}
              style={
                contentWidth != null
                  ? {
                      maxWidth: contentWidth + EDITOR_PADDING_HORIZONTAL,
                    }
                  : undefined
              }
            >
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    aria-multiline
                    role="textbox"
                    aria-placeholder={placeholder}
                    placeholder={
                      <div
                        className={cn(
                          "pointer-events-none absolute top-6 left-10 select-none text-muted-foreground",
                          // Lexical の Placeholder は contenteditable の兄弟のため prose の子にならない。
                          // 本文（prose-base / lg:prose-lg + prose-p:leading-relaxed）と行ボックスを揃える
                          "text-base leading-relaxed lg:text-lg",
                        )}
                      >
                        {placeholder}
                      </div>
                    }
                    className={`outline-none pl-10 pr-6 py-6 min-h-full ${className ?? ""}`}
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
          <DisablePlugin disabled={disabled} />
          <DraggableBlockPlugin anchorElem={contentWidthRef} />
          <TableActionMenuPlugin anchorElem={contentWidthRef} />
          {contentWrapperRef && (
            <FloatingToolbarPlugin
              anchorElem={contentWrapperRef}
              setIsLinkEditMode={(isEditMode) => {
                if (isEditMode) dialogManager.openDialog("link");
              }}
              {...(onAddComment && { onAddComment: handleAddComment })}
              onOpenRuby={() => dialogManager.openDialog("ruby")}
              onOpenTooltip={() => dialogManager.openDialog("tooltip")}
            />
          )}
          <LinkHoverPreviewPlugin />
          <CommentPlugin {...(onMarkClick && { onMarkClick })} />
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
              {...(onAutoSave && { onAutoSave })}
              {...(autoSaveKey !== undefined && { autoSaveKey })}
              onStatusChange={setSaveStatus}
            />
          )}

          {/* ブロックテンプレート */}
          <BlockTemplatePlugin
            isSaveOpen={dialogManager.activeDialog === "blockTemplateSave"}
            isInsertOpen={dialogManager.activeDialog === "blockTemplateInsert"}
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
        </section>

        {/* インスペクターサイドバー（開閉は InspectorSidebar 内 + ツールバー / ショートカット） */}
        {inspectorEnabled && <InspectorSidebar />}
      </div>
    </InspectorSidebarProvider>
  );
}

// =============================================================================
// 無効な contentJson（正規化しない — DB / 親を修正する）
// =============================================================================

function LexicalInvalidContentJsonNotice() {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground"
    >
      <AlertCircle
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">EditorState JSON が無効です</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            lexicalJsonSchema
          </code>{" "}
          を満たす文字列のみマウントします。空の本文は{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            EMPTY_LEXICAL_EDITOR_STATE_JSON
          </code>{" "}
          を渡してください。DB に古い形式が残る場合は{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground">
            docs/operations/lexical-editor-state-json.md
          </code>{" "}
          を参照してください。
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// LexicalEditor - メインコンポーネント
// =============================================================================

export function LexicalEditor(props: LexicalEditorProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // モバイルデバイスでは読み取り専用フォールバック
  // コンポーネント境界で分離し、モバイルでは Lexical 初期化コストを完全回避
  if (!isDesktop) {
    return (
      <MobileEditorFallback
        contentJson={props.contentJson}
        {...(props.height !== undefined && { height: props.height })}
      />
    );
  }

  return <LexicalEditorDesktop {...props} />;
}

// =============================================================================
// LexicalEditorDesktop - デスクトップ専用（Lexical初期化）
// =============================================================================

function LexicalEditorDesktop(props: LexicalEditorProps) {
  const trimmed = props.contentJson.trim();
  if (!isLexicalComposerReadyEditorStateJson(trimmed)) {
    return <LexicalInvalidContentJsonNotice />;
  }
  return <LexicalEditorDesktopMounted {...props} editorStateJson={trimmed} />;
}

type LexicalEditorDesktopMountedProps = LexicalEditorProps & {
  editorStateJson: string;
};

function LexicalEditorDesktopMounted({
  editorStateJson,
  ...props
}: LexicalEditorDesktopMountedProps) {
  // useState lazy initializer: 初回マウント時のみ実行（非制御コンポーネント設計）
  // editorStateJson は初期値としてのみ使用。以降の props.contentJson 変更は無視される
  const [initialConfig] = useState(() => ({
    namespace: "LexicalEditor",
    theme: editorTheme,
    nodes: [...EDITOR_NODES],
    editorState: editorStateJson,
    onError: (error: Error) => {
      logger.error("Lexical initialization error", { error: error.message });
    },
  }));

  const { contentJson: _contentJsonForInitialStateOnly, ...editorInnerProps } =
    props;

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorInner {...editorInnerProps} />
    </LexicalComposer>
  );
}
