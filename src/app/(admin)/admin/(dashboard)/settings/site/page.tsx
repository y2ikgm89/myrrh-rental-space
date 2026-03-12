/**
 * サイト設定ページ
 *
 * 一般設定・SEO設定・レイアウトをタブで切り替え
 * ナビゲーションとお知らせバーは独立ページに分離
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from "react";
import { getSettings } from "@/admin/queries/settings";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  BasicInfoSection,
  ContactInfoSection,
  SeoSection,
  RobotsTxtSection,
  SidebarSection,
  LayoutSection,
  HeaderSection,
  FooterSection,
  PermalinkSection,
} from "../_components/sections";
import type { ReactElement } from "react";

/**
 * 動的コンテンツ: サイト設定
 */
async function SiteSettingsContent(): Promise<ReactElement> {
  const settings = await getSettings();

  if (!settings) {
    return (
      <SettingsLayout
        title="サイト設定"
        description="一般設定・SEO・レイアウト・投稿"
      >
        <div className="text-center py-8 text-muted-foreground">
          設定を読み込めませんでした
        </div>
      </SettingsLayout>
    );
  }

  const tabs = [
    {
      value: "general",
      label: "一般",
      content: (
        <div className="space-y-6">
          <BasicInfoSection settings={settings} />
          <ContactInfoSection settings={settings} />
        </div>
      ),
    },
    {
      value: "seo",
      label: "SEO",
      content: (
        <div className="space-y-6">
          <SeoSection settings={settings} />
          <RobotsTxtSection />
        </div>
      ),
    },
    {
      value: "layout",
      label: "レイアウト",
      content: (
        <div className="space-y-6">
          <HeaderSection settings={settings} />
          <FooterSection settings={settings} />
          <SidebarSection settings={settings} />
          <LayoutSection settings={settings} />
        </div>
      ),
    },
    {
      value: "post",
      label: "投稿",
      content: <PermalinkSection settings={settings} />,
    },
  ];

  return (
    <SettingsLayout
      title="サイト設定"
      description="一般設定・SEO・レイアウト・投稿"
    >
      <SettingsTabs tabs={tabs} defaultTab="general" />
    </SettingsLayout>
  );
}

/**
 * ローディングUI
 */
function SiteSettingsLoading(): ReactElement {
  return (
    <SettingsLayout
      title="サイト設定"
      description="一般設定・SEO・レイアウト・投稿"
    >
      <div className="animate-pulse space-y-6">
        <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
          <div className="h-8 w-16 bg-muted-foreground/30 rounded-md" />
          <div className="h-8 w-12 bg-muted rounded-md" />
          <div className="h-8 w-20 bg-muted rounded-md" />
          <div className="h-8 w-16 bg-muted rounded-md" />
        </div>
        <div className="h-48 bg-muted rounded" />
        <div className="h-48 bg-muted rounded" />
      </div>
    </SettingsLayout>
  );
}

export default async function SiteSettingsPage(): Promise<ReactElement> {
  return (
    <Suspense fallback={<SiteSettingsLoading />}>
      <SiteSettingsContent />
    </Suspense>
  );
}
