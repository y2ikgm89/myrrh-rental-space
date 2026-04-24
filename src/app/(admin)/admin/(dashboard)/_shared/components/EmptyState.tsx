import Link from "next/link";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { Button } from "./ui/button";

type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

type EmptyStateProps = {
  message: string;
  description?: string;
  action?: EmptyStateAction;
};

/**
 * 統一された空状態コンポーネント
 *
 * @example
 * ```tsx
 * // リンクアクション
 * <EmptyState
 *   message="ブログ記事がありません"
 *   action={{ label: "新規作成", href: "/admin/posts/new" }}
 * />
 *
 * // クリックアクション（Dialog 起動等）
 * <EmptyState
 *   message="質問がありません"
 *   action={{ label: "質問を追加", onClick: () => setOpen(true) }}
 * />
 * ```
 */
export function EmptyState({ message, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border bg-card p-12 text-center">
      <p className="text-muted-foreground">{message}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {action &&
        (action.href !== undefined ? (
          <Button asChild className="mt-4">
            <Link href={toAppRoute(action.href)}>{action.label}</Link>
          </Button>
        ) : (
          <Button type="button" className="mt-4" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
