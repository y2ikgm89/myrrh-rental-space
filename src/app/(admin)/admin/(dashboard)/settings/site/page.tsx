/**
 * サイト基本設定ページ
 *
 * 一般設定（基本情報 + 連絡先）・SEO・投稿（パーマリンク）。
 * レイアウト / ヘッダー / フッター / サイドバー / ナビゲーション / お知らせバーは
 * /admin/settings/appearance に集約済み。
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from "react";
import { connection } from "next/server";
import { getSettings } from "@/admin/queries/settings";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  BasicInfoSection,
  ContactInfoSection,
  SeoSection,
  RobotsTxtSection,
  PermalinkSection,
} from "../_components/sections";
import type { ReactElement } from "react";

async function SiteSettingsContent(): Promise<ReactElement> {
  await connection();
  const settings = await getSettings();

  if (!settings) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        設定を読み込めませんでした
      </div>
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
      value: "post",
      label: "投稿",
      content: <PermalinkSection settings={settings} />,
    },
  ];

  return <SettingsTabs tabs={tabs} defaultTab="general" />;
}

function SiteSettingsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-16 bg-muted-foreground/30 rounded-md" />
        <div className="h-8 w-12 bg-muted rounded-md" />
        <div className="h-8 w-16 bg-muted rounded-md" />
      </div>
      <div className="h-48 bg-muted rounded" />
      <div className="h-48 bg-muted rounded" />
    </div>
  );
}

export default async function SiteSettingsPage(): Promise<ReactElement> {
  return (
    <SettingsLayout
      title="サイト基本"
      description="一般設定・連絡先・SEO・投稿"
    >
      <Suspense fallback={<SiteSettingsLoading />}>
        <SiteSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
