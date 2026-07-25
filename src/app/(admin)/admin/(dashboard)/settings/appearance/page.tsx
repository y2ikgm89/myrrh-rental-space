/**
 * サイトの見た目設定ページ
 *
 * 公開サイトの chrome（レイアウト / ヘッダー / フッター / サイドバー /
 * ナビゲーション / お知らせバー）を 1 つのページに集約。
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from "react";
import { connection } from "next/server";
import { getSettings } from "@/admin/queries/settings";
import { getNavigationItems, getSocialLinks } from "@/admin/queries/navigation";
import { getAnnouncementBars } from "@/admin/queries/announcement-bar";
import { getAnnouncementBarCarouselSettings } from "@/admin/queries/settings";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import { HeaderSection } from "../_components/sections/HeaderSection";
import { FooterSection } from "../_components/sections/FooterSection";
import { SidebarSection } from "../_components/sections/SidebarSection";
import { LayoutSection } from "../_components/sections/LayoutSection";
import { NavigationManager } from "./_components/navigation/NavigationManager";
import { AnnouncementBarManager } from "./_components/announcement-bar/AnnouncementBarManager";
import type { ReactElement } from "react";

async function AppearanceSettingsContent(): Promise<ReactElement> {
  await connection();

  const user = await requireAdminPermission("settings", "read");
  const canUpdateSettings = hasPermission(user.role, "settings", "update");
  const canUpdateNavigation = hasPermission(user.role, "navigation", "update");
  const canUpdateAnnouncementBar = hasPermission(
    user.role,
    "announcementBar",
    "update",
  );
  const readOnlySettings = !canUpdateSettings;

  const [
    settings,
    desktopItems,
    mobileItems,
    footerItems,
    socialLinks,
    { items: announcementBars },
    carouselSettings,
  ] = await Promise.all([
    getSettings(),
    getNavigationItems("HEADER_DESKTOP"),
    getNavigationItems("HEADER_MOBILE"),
    getNavigationItems("FOOTER"),
    getSocialLinks(),
    getAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ]);

  if (!settings) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        設定を読み込めませんでした
      </div>
    );
  }

  const tabs = [
    {
      value: "header",
      label: "ヘッダー",
      content: (
        <HeaderSection settings={settings} readOnly={readOnlySettings} />
      ),
    },
    {
      value: "footer",
      label: "フッター",
      content: (
        <FooterSection settings={settings} readOnly={readOnlySettings} />
      ),
    },
    {
      value: "sidebar",
      label: "サイドバー",
      content: (
        <SidebarSection settings={settings} readOnly={readOnlySettings} />
      ),
    },
    {
      value: "layout",
      label: "レイアウト",
      content: (
        <LayoutSection settings={settings} readOnly={readOnlySettings} />
      ),
    },
    {
      value: "navigation",
      label: "ナビゲーション",
      content: (
        <NavigationManager
          initialDesktopItems={desktopItems}
          initialMobileItems={mobileItems}
          initialFooterItems={footerItems}
          initialSocialLinks={socialLinks}
          readOnly={!canUpdateNavigation}
        />
      ),
    },
    {
      value: "announcement-bar",
      label: "お知らせバー",
      content: (
        <AnnouncementBarManager
          initialBars={announcementBars}
          initialCarouselSettings={carouselSettings}
          readOnly={!canUpdateAnnouncementBar}
        />
      ),
    },
  ];

  return <SettingsTabs tabs={tabs} defaultTab="header" />;
}

function AppearanceSettingsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-20 bg-muted-foreground/30 rounded-md" />
        <div className="h-8 w-16 bg-muted rounded-md" />
        <div className="h-8 w-20 bg-muted rounded-md" />
        <div className="h-8 w-20 bg-muted rounded-md" />
        <div className="h-8 w-24 bg-muted rounded-md" />
        <div className="h-8 w-24 bg-muted rounded-md" />
      </div>
      <div className="h-48 bg-muted rounded" />
    </div>
  );
}

export default async function AppearanceSettingsPage(): Promise<ReactElement> {
  await connection();
  const user = await requireAdminPermission("settings", "read");
  const canUpdateAnyAppearanceSection =
    hasPermission(user.role, "settings", "update") ||
    hasPermission(user.role, "navigation", "update") ||
    hasPermission(user.role, "announcementBar", "update");
  const readOnly = !canUpdateAnyAppearanceSection;

  return (
    <SettingsLayout
      title="サイトの見た目"
      description="ヘッダー・フッター・サイドバー・レイアウト・ナビゲーション・お知らせバーをまとめて管理"
      readOnly={readOnly}
    >
      <Suspense fallback={<AppearanceSettingsLoading />}>
        <AppearanceSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
