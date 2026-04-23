import type { ReactElement } from "react";

/**
 * PreviewBanner — プレビューモード通知
 *
 * 管理画面から開かれたプレビューを公開ページと視覚的に区別するための通知。
 */
export function PreviewBanner(): ReactElement {
  return (
    <div
      role="status"
      className="bg-accent/10 py-2 text-center text-xs text-accent"
    >
      プレビューモード — この表示は管理画面用の確認ページです
    </div>
  );
}
