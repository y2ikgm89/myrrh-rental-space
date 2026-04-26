"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { ComponentPropsWithRef, KeyboardEvent } from "react";
import { TableRow } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";

type ClickableTableRowProps = Omit<
  ComponentPropsWithRef<typeof TableRow>,
  "onClick" | "onKeyDown" | "tabIndex" | "role"
> & {
  /** 遷移先 URL（`router.push()` に渡される）。Next.js の型付きルートに準拠 */
  readonly href: Route<string>;
  /** スクリーンリーダー向けの行ラベル */
  readonly "aria-label": string;
};

/**
 * 管理画面テーブルの行クリック遷移用 `<TableRow>` ラッパー。
 *
 * - `<tr>` の semantic（`role="row"`）を維持
 * - `tabIndex={0}` + `onKeyDown(Enter)` + `aria-label` で SR / キーボード対応
 * - `cursor-pointer` + hover/focus 視覚フィードバック
 * - 内部 interactive 要素（CheckboxCell / StatusSelect / ActionDropdown）の click は
 *   呼び出し側で `<TableCell onClick={stopRowClick}>` を付けて伝播を遮断する
 *
 * Space キーは `<a>` 慣習に合わせて未対応（スクロール衝突回避）。
 */
export function ClickableTableRow({
  href,
  "aria-label": ariaLabel,
  className,
  children,
  ...rest
}: ClickableTableRowProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(href);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(href);
    }
  };

  return (
    <TableRow
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer transition-colors",
        "hover:bg-muted/30",
        "focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
      {...rest}
    >
      {children}
    </TableRow>
  );
}
