"use client";

import { useMemo } from "react";
import { Monitor } from "lucide-react";
import { SanitizedHtml } from "@/admin/components/SanitizedHtml";
import { renderEditorStateJsonToHtmlClient } from "../preview/render-editor-state-to-html-client";

type MobileEditorFallbackProps = {
  /** プライマリ: フォーム／親が保持する最新の EditorState JSON（未保存含む） */
  contentJson?: string | null | undefined;
  /** JSON からの生成に失敗したとき、または JSON がないときのフォールバック */
  contentHtml?: string | undefined;
  height?: string;
};

export function MobileEditorFallback({
  contentJson,
  contentHtml,
  height = "300px",
}: MobileEditorFallbackProps) {
  const htmlFromJson = useMemo(() => {
    if (contentJson === undefined || contentJson === null) {
      return "";
    }
    return renderEditorStateJsonToHtmlClient(contentJson);
  }, [contentJson]);

  const fallbackHtml = (contentHtml ?? "").trim();
  const fromJsonTrimmed = htmlFromJson.trim();
  const previewHtml =
    fromJsonTrimmed !== "" ? htmlFromJson : fallbackHtml !== "" ? contentHtml : "";
  const previewSource =
    fromJsonTrimmed !== ""
      ? ("json" as const)
      : fallbackHtml !== ""
        ? ("html" as const)
        : ("none" as const);

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* デスクトップ必須メッセージ */}
      <div className="flex flex-col items-center justify-center gap-3 p-6 border-b border-border">
        <Monitor className="h-10 w-10 text-muted-foreground" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">
            デスクトップ環境でご利用ください
          </p>
          <p className="text-xs text-muted-foreground">
            リッチテキストエディタは画面幅1024px以上のデバイスが必要です
          </p>
        </div>
      </div>

      {previewHtml ? (
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <p className="text-xs text-muted-foreground mb-2">
            {previewSource === "json"
              ? "現在の編集内容のプレビュー（読み取り専用・未保存の変更を含みます）"
              : "保存済みの内容のプレビュー（読み取り専用）"}
          </p>
          <div className="prose prose-sm max-w-none opacity-60 pointer-events-none">
            <SanitizedHtml html={previewHtml} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
