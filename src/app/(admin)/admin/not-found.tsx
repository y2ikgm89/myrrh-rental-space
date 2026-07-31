/**
 * `/admin` セグメントの 404 境界（**layout が投げた `notFound()` の受け皿**）
 *
 * ## なぜ (dashboard)/not-found.tsx とは別に必要なのか
 *
 * segment 自身の `not-found.tsx` は **その segment の子ルート**を包むだけで、
 * 同じ segment の `layout.tsx` が投げた `notFound()` は捕捉できない
 * （React の境界セマンティクスと同じ。境界を描画する側の throw は親へ抜ける）。
 *
 * `verifyAdminSession()` は `(dashboard)/layout.tsx` の `DashboardChromeResolved`
 * から呼ばれるため、dashboard role を持たない IAP ユーザーの拒否は
 * `(dashboard)/not-found.tsx` を**飛び越える**。親にこの境界が無いと
 * `global-not-found.tsx`（「全く未マッチの URL（ルーティング外）にのみ使われ」）へ
 * 落ちてしまい、管理画面の文脈が失われる。
 *
 * dashboard chrome（sidebar / topbar）は描画しない。chrome の解決そのものが
 * 失敗した経路なので、`(admin)/admin/layout.tsx` までの最小構成で表示する。
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/admin/components/ui";

export const metadata: Metadata = {
  title: "アクセスできません | 管理画面",
};

export default function AdminSegmentNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4">
          <span className="text-6xl font-bold text-muted">404</span>
        </div>

        <h1 className="mb-3 text-xl font-bold text-foreground">
          アクセスできません
        </h1>

        <p className="mb-6 text-sm text-muted-foreground">
          お探しの管理ページは存在しないか、
          <br />
          アクセス権限がない可能性があります。
        </p>

        <Button asChild>
          <Link href="/admin">ダッシュボードへ</Link>
        </Button>
      </div>
    </div>
  );
}
