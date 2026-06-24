/**
 * PublicEmptyState — 公開ページの一覧 0 件状態 SSoT
 *
 * space-grid / post-grid / news-archive-list で同じ形（中央寄せ・muted-foreground 文言・
 * オプションの "フィルタ/検索を解除" CTA）が3か所で重複していたものを 1 箇所に集約。
 *
 * - `role="status"` で SR にライブリージョンとして通知（既存実装の踏襲）
 * - 縦余白は `py-[var(--spacing-fluid-lg)]`（既存パターン）
 * - 任意の `action` slot で「フィルタを解除」「検索を解除」リンクボタン等を差し込み可
 */

import type { ReactElement, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface PublicEmptyStateProps {
  readonly message: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function PublicEmptyState({
  message,
  action,
  className,
}: PublicEmptyStateProps): ReactElement {
  return (
    <div
      role="status"
      className={cn(
        "space-y-6 py-[var(--spacing-fluid-lg)] text-center",
        className,
      )}
    >
      <p className="text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
