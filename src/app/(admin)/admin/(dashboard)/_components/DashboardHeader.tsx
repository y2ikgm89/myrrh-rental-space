"use client";

/**
 * ダッシュボードヘッダー
 *
 * 静的コンテンツ + 現在日付表示
 */

import { format } from "date-fns";
import { ja } from "date-fns/locale";

export function DashboardHeader() {
  const today = new Date();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        ダッシュボード
      </h1>
      <p className="text-muted-foreground">
        {format(today, "yyyy年M月d日 (EEEE)", { locale: ja })}
      </p>
    </div>
  );
}
