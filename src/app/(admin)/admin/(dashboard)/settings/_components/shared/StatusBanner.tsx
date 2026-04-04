/**
 * ステータスバナーコンポーネント
 *
 * 接続テスト結果の表示に使用
 * - 成功: green系
 * - エラー: destructive系（統一カラー）
 */

import type { ReactNode, ReactElement } from "react";

import { cn } from "@/shared/lib/cn";

interface StatusBannerProps {
  success: boolean;
  children: ReactNode;
}

export function StatusBanner({
  success,
  children,
}: StatusBannerProps): ReactElement {
  const styles = success
    ? "border-success/20 bg-success/10"
    : "border-destructive/50 bg-destructive/10";

  return <div className={cn("rounded-lg border p-4", styles)}>{children}</div>;
}
