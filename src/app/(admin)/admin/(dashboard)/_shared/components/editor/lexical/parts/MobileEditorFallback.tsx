"use client";

import { IconAlertCircle, IconDeviceDesktop } from "@tabler/icons-react";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { cn } from "@/shared/lib/cn";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import { ImperativeCssScope } from "@/shared/lib/csp/imperative-css-scope";
import { isLexicalComposerReadyEditorStateJson } from "@/shared/lib/validations/lexical";
import { renderEditorStateJsonToHtmlClient } from "../preview/render-editor-state-to-html-client";
import { findUnregisteredLexicalNodeTypes } from "../config/registered-node-types";
import { LexicalCorruptedContentNotice } from "./LexicalCorruptedContentNotice";

type MobileEditorFallbackProps = {
  /** フォーム／親が保持する最新の EditorState JSON（未保存含む） */
  contentJson: string;
  height?: string;
};

export function MobileEditorFallback({
  contentJson,
  height = "300px",
}: MobileEditorFallbackProps) {
  const trimmed = contentJson.trim();
  const jsonOk = isLexicalComposerReadyEditorStateJson(trimmed);
  const unregisteredTypes = jsonOk
    ? findUnregisteredLexicalNodeTypes(trimmed)
    : [];
  const hasUnregisteredTypes = unregisteredTypes.length > 0;

  const previewHtml =
    jsonOk && !hasUnregisteredTypes
      ? renderEditorStateJsonToHtmlClient(trimmed).trim()
      : null;

  return (
    <ImperativeCssScope
      className={cn("flex flex-col", CSS_VAR_CLASS.editorHeight)}
      cssVars={{ [CSS_VAR.editorHeight]: height }}
    >
      <div className="flex flex-col items-center justify-center gap-3 border-b border-border p-6">
        <IconDeviceDesktop className="h-10 w-10 text-muted-foreground" />
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-foreground">
            デスクトップ環境でご利用ください
          </p>
          <p className="text-xs text-muted-foreground">
            リッチテキストエディタは画面幅1024px以上のデバイスが必要です
          </p>
        </div>
      </div>

      {!jsonOk ? (
        <div
          role="alert"
          className="flex gap-3 border-b border-border p-4 text-sm text-foreground"
        >
          <IconAlertCircle
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            EditorState JSON が無効なためプレビューできません。空の本文は{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">
              EMPTY_LEXICAL_EDITOR_STATE_JSON
            </code>{" "}
            を渡すか、有効な Lexical EditorState JSON
            でデータを修正してください。
          </p>
        </div>
      ) : hasUnregisteredTypes ? (
        <div className="border-b border-border p-4">
          <LexicalCorruptedContentNotice
            unregisteredTypes={unregisteredTypes}
            contentJson={trimmed}
          />
        </div>
      ) : previewHtml ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            現在の編集内容のプレビュー（読み取り専用・未保存の変更を含みます）
          </p>
          {/* 減光しない。これは UI コントロールではなく**コンテンツ**なので、
              `pointer-events-none` で操作不能にしても SC 1.4.3 の inactive 例外
              （対象は user interface component）には当たらず 4.5:1 が要る。
              `opacity-60` では本文が 4.65〜4.74:1 と余裕がほぼ無く、prose 内の
              見出し・リンク・muted テキストは容易に AA を割る。読み取り専用で
              あることは直前の説明文が伝えている。 */}
          <div className="prose prose-sm pointer-events-none max-w-none">
            <SanitizedHtml sanitizedHtml={previewHtml} />
          </div>
        </div>
      ) : null}
    </ImperativeCssScope>
  );
}
