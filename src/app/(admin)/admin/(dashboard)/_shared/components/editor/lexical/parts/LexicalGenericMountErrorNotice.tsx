/**
 * LexicalGenericMountErrorNotice
 *
 * @description `LexicalMountErrorBoundary`（副防御）専用の汎用フォールバック UI。
 *
 * `componentDidCatch` は「chunk 読み込み失敗」「無関係な子コンポーネントの
 * render/lifecycle 例外」など、未登録 node type による本文破損とは無関係な
 * 例外も広く捕捉する。原因が未確認のまま `LexicalCorruptedContentNotice` の
 * 破壊的リセットを提示すると、正常な本文を管理者が誤って消去しうる
 * （PR#1346 レビュー指摘 P1）。
 *
 * このコンポーネントは本文の内容には一切触れず、破壊的な操作を提供しない。
 * 未登録 node type が実際に検出された場合のみ `LexicalCorruptedContentNotice`
 * を使うこと。
 */

"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";

type LexicalGenericMountErrorNoticeProps = {
  /** 指定時のみ「再試行」ボタンを表示する */
  onRetry?: (() => void) | undefined;
};

export function LexicalGenericMountErrorNotice({
  onRetry,
}: LexicalGenericMountErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground"
    >
      <IconAlertCircle
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="font-medium">
            エディタの読み込み中にエラーが発生しました
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            一時的な読み込み失敗の可能性があります。本文データは破棄されていません。再試行しても解決しない場合は、ページを再読み込みするか管理者にお問い合わせください。
          </p>
        </div>

        {onRetry && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              再試行する
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
