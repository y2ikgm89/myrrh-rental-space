import type { ReactElement } from "react";

/**
 * PreviewBanner — プレビューモード通知
 *
 * 管理画面から開かれた sessionStorage ベースのプレビューページで、
 * 公開ページと視覚的に区別するためにページ上部に表示する。
 */
export function PreviewBanner(): ReactElement {
  return (
    <div
      role="status"
      className="bg-accent/10 py-2 text-center text-xs text-accent"
    >
      プレビューモード — このページは公開されていません
    </div>
  );
}
