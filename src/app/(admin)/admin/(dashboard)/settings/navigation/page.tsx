/**
 * ナビゲーション管理ページ
 *
 * ヘッダー・フッターのナビゲーションメニューとSNSリンクを管理
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: ナビゲーションデータ（Suspenseでラップ）
 */

import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { getNavigationItems, getSocialLinks } from "@/admin/queries/navigation";
import { SettingsLayout } from "../_components/SettingsLayout";
import { NavigationManager } from "../site/_components/navigation/NavigationManager";
import type { ReactElement } from "react";

/**
 * 動的コンテンツ: ナビゲーション管理
 */
async function NavigationContent(): Promise<ReactElement> {
  await connection();
  const [desktopItems, mobileItems, footerItems, socialLinks] =
    await Promise.all([
      getNavigationItems("HEADER_DESKTOP"),
      getNavigationItems("HEADER_MOBILE"),
      getNavigationItems("FOOTER"),
      getSocialLinks(),
    ]);

  return (
    <NavigationManager
      initialDesktopItems={desktopItems}
      initialMobileItems={mobileItems}
      initialFooterItems={footerItems}
      initialSocialLinks={socialLinks}
    />
  );
}

/**
 * ローディングUI
 */
function NavigationLoading(): ReactElement {
  return (
    <div className="space-y-6">
      {/* タブ */}
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted-foreground/30" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>

      {/* テーブル */}
      <div className="animate-pulse space-y-4">
        <div className="h-64 rounded bg-muted" />
      </div>
    </div>
  );
}

export default async function NavigationSettingsPage(): Promise<ReactElement> {
  return (
    <SettingsLayout
      title="ナビゲーション管理"
      description={
        <>
          ヘッダー・フッターのメニューとSNSリンクを管理します。 外観の設定は
          <Link
            href="/admin/settings/site?tab=layout"
            className="text-primary underline-offset-4 hover:underline"
          >
            サイト設定 &gt; レイアウト
          </Link>
          で変更できます。
        </>
      }
    >
      <Suspense fallback={<NavigationLoading />}>
        <NavigationContent />
      </Suspense>
    </SettingsLayout>
  );
}
