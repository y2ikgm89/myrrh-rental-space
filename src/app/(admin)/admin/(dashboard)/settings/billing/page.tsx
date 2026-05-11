/**
 * 課金・決済設定ページ
 *
 * Stripe 決済 + 割引設定 + 消費税設定を 1 つのページに集約。
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from "react";
import { connection } from "next/server";
import {
  getSettings,
  getDiscountSettings,
  getTaxSettings,
} from "@/admin/queries/settings";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  StripeSection,
  DiscountSection,
  TaxSection,
} from "../_components/sections";
import type { ReactElement } from "react";

async function BillingSettingsContent(): Promise<ReactElement> {
  await connection();
  const [settings, discountSettings, taxSettings] = await Promise.all([
    getSettings(),
    getDiscountSettings(),
    getTaxSettings(),
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
      value: "payment",
      label: "決済",
      content: <StripeSection settings={settings} />,
    },
    {
      value: "discount",
      label: "割引",
      content: <DiscountSection settings={discountSettings} />,
    },
    {
      value: "tax",
      label: "消費税",
      content: <TaxSection settings={taxSettings} />,
    },
  ];

  return <SettingsTabs tabs={tabs} defaultTab="payment" />;
}

function BillingSettingsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-12 bg-muted-foreground/30 rounded-md" />
        <div className="h-8 w-12 bg-muted rounded-md" />
        <div className="h-8 w-16 bg-muted rounded-md" />
      </div>
      <div className="h-48 bg-muted rounded" />
    </div>
  );
}

export default async function BillingSettingsPage(): Promise<ReactElement> {
  return (
    <SettingsLayout
      title="課金・決済"
      description="Stripe オンライン決済・割引・消費税の設定"
    >
      <Suspense fallback={<BillingSettingsLoading />}>
        <BillingSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
