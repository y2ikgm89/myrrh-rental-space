/**
 * TableShell — 管理画面テーブルの外側 wrapper SSoT
 *
 * `<div className="rounded-lg border bg-card overflow-hidden"><div className="overflow-x-auto">...</div></div>`
 * の二重 div を 1 か所に集約する。ほぼ全ての admin テーブル view（30+ ファイル）で
 * 同じパターンが直書きされていた。
 *
 * - 内側 `overflow-x-auto` でモバイル横スクロールを担保
 * - 外側 `overflow-hidden` で `rounded-lg` の角を子要素が突き抜けないよう clip
 * - bg-card / border は admin デザイントークン依存
 */

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface TableShellProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function TableShell({ children, className }: TableShellProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
