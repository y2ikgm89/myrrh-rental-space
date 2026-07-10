"use client";

/**
 * ダッシュボードヘッダー
 *
 * 静的コンテンツ + 現在日付表示
 */

import { formatDateWithWeekday } from "@/shared/lib/date-format";

export function DashboardHeader() {
  // eslint-disable-next-line @eslint-react/purity -- Client Component: new Date() is safe here
  const today = new Date();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        ダッシュボード
      </h1>
      <p className="text-muted-foreground">{formatDateWithWeekday(today)}</p>
    </div>
  );
}
