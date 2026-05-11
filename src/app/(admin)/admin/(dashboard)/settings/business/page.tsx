/**
 * ビジネス設定ページ
 *
 * 事業者情報・営業時間・予約設定。
 * 割引 / 消費税 / Stripe 決済は /admin/settings/billing に集約済み。
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
  BusinessInfoSection,
  BusinessHoursSection,
  ReservationSection,
} from "../_components/sections";
import type { ReactElement } from "react";

async function BusinessSettingsContent(): Promise<ReactElement> {
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
      value: "info",
      label: "事業者情報",
      content: <BusinessInfoSection settings={settings} />,
    },
    {
      value: "hours",
      label: "営業時間",
      content: <BusinessHoursSection settings={settings} />,
    },
    {
      value: "reservation",
      label: "予約",
      content: <ReservationSection settings={settings} />,
    },
  ];

  return <SettingsTabs tabs={tabs} defaultTab="info" />;
}

function BusinessSettingsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-20 bg-muted-foreground/30 rounded-md" />
        <div className="h-8 w-16 bg-muted rounded-md" />
        <div className="h-8 w-12 bg-muted rounded-md" />
      </div>
      <div className="h-48 bg-muted rounded" />
    </div>
  );
}

export default async function BusinessSettingsPage(): Promise<ReactElement> {
  return (
    <SettingsLayout
      title="ビジネス設定"
      description="事業者情報・営業時間・予約の設定"
    >
      <Suspense fallback={<BusinessSettingsLoading />}>
        <BusinessSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
