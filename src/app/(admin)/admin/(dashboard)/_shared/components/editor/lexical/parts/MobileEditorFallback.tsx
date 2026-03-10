"use client";

import { Monitor } from "lucide-react";
import { SanitizedHtml } from "@/admin/components/SanitizedHtml";

type MobileEditorFallbackProps = {
  contentHtml?: string;
  height?: string;
};

export function MobileEditorFallback({
  contentHtml,
  height = "300px",
}: MobileEditorFallbackProps) {
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

      {/* 読み取り専用プレビュー（contentHtml がある場合） */}
      {contentHtml && (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground mb-2">
            現在のコンテンツ（読み取り専用）:
          </p>
          <div className="prose prose-sm max-w-none opacity-60 pointer-events-none">
            <SanitizedHtml html={contentHtml} />
          </div>
        </div>
      )}
    </div>
  );
}
