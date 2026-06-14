"use client";

import { IconAlertCircle, IconDeviceDesktop } from "@tabler/icons-react";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { isLexicalComposerReadyEditorStateJson } from "@/shared/lib/validations/lexical";
import { renderEditorStateJsonToHtmlClient } from "../preview/render-editor-state-to-html-client";

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

  const previewHtml = jsonOk
    ? renderEditorStateJsonToHtmlClient(trimmed).trim()
    : null;

  return (
    <div className="flex flex-col" style={{ height }}>
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
      ) : previewHtml ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            現在の編集内容のプレビュー（読み取り専用・未保存の変更を含みます）
          </p>
          <div className="prose prose-sm pointer-events-none max-w-none opacity-60">
            <SanitizedHtml html={previewHtml} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
