/**
 * お知らせバー管理ページ
 *
 * サイト上部に表示するお知らせバーを管理
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: お知らせバーデータ（Suspenseでラップ）
 */

import { Suspense } from "react";
import { connection } from "next/server";
import { getAnnouncementBars } from "@/admin/queries/announcement-bar";
import { getAnnouncementBarCarouselSettings } from "@/admin/queries/settings";
import { SettingsLayout } from "../_components/SettingsLayout";
import { AnnouncementBarManager } from "../site/_components/announcement-bar";
import type { ReactElement } from "react";

/**
 * 動的コンテンツ: お知らせバー管理
 */
async function AnnouncementBarContent(): Promise<ReactElement> {
  await connection();
  const [{ items: announcementBars }, carouselSettings] = await Promise.all([
    getAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ]);

  return (
    <AnnouncementBarManager
      initialBars={announcementBars}
      initialCarouselSettings={carouselSettings}
    />
  );
}

/**
 * ローディングUI
 */
function AnnouncementBarLoading(): ReactElement {
  return (
    <div className="space-y-6">
      {/* タブ */}
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted-foreground/30" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>

      {/* テーブル */}
      <div className="animate-pulse space-y-4">
        <div className="h-64 rounded bg-muted" />
      </div>
    </div>
  );
}

export default async function AnnouncementBarPage(): Promise<ReactElement> {
  return (
    <SettingsLayout
      title="お知らせバー管理"
      description="サイト上部に表示するお知らせバーを管理します"
    >
      <Suspense fallback={<AnnouncementBarLoading />}>
        <AnnouncementBarContent />
      </Suspense>
    </SettingsLayout>
  );
}
