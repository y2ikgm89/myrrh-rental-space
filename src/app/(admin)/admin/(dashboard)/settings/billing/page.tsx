/**
 * 課金・決済設定ページ
 *
 * Stripe 決済 + 割引設定 + 消費税設定を 1 つのページに集約。
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getSettings,
  getDiscountSettings,
  getTaxSettings,
  getRefundPolicySettings,
  getStripeEnvSecretOverrideActive,
} from "@/admin/queries/settings";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  StripeSection,
  DiscountSection,
  TaxSection,
  RefundPolicySection,
} from "../_components/sections";
import { Alert, AlertDescription, AlertTitle } from "@/admin/components/ui";
import { getAppUrl } from "@/shared/lib/constants";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  AdminTaxSettings,
  DiscountSettingsData,
} from "@/shared/domain/settings/types";
import type { ReactElement } from "react";

async function BillingSettingsContent(): Promise<ReactElement> {
  await connection();
  const [
    settings,
    discountSettings,
    taxSettings,
    refundPolicySettings,
    stripeEnvSecretActive,
    paymentFeatureEnabled,
  ] = await Promise.all([
    getSettings(),
    getDiscountSettings(),
    getTaxSettings(),
    getRefundPolicySettings(),
    getStripeEnvSecretOverrideActive(),
    isFeatureEnabled("payment"),
  ]);

  if (!settings) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        設定を読み込めませんでした
      </div>
    );
  }

  const stripeWebhookUrl = `${getAppUrl()}/api/webhooks/stripe`;
  const maxReservationHours = Math.max(
    1,
    Math.floor(settings.maxReservationDuration / 60),
  );

  const tabs = [
    {
      value: "payment",
      label: "決済",
      content: (
        <StripeSection
          settings={settings}
          stripeWebhookUrl={stripeWebhookUrl}
          stripeEnvSecretActive={stripeEnvSecretActive}
        />
      ),
    },
    {
      value: "discount",
      label: "割引",
      content: (
        <DiscountSection
          settings={
            toPlainObject(
              discountSettings,
            ) satisfies Serialized<DiscountSettingsData>
          }
          maxReservationHours={maxReservationHours}
        />
      ),
    },
    {
      value: "tax",
      label: "消費税",
      content: (
        <TaxSection
          settings={
            toPlainObject(taxSettings) satisfies Serialized<AdminTaxSettings>
          }
        />
      ),
    },
    {
      value: "refund-policy",
      label: "返金ポリシー",
      content: (
        <RefundPolicySection
          settings={refundPolicySettings.policy}
          commerceUpdatedAt={refundPolicySettings.commerceUpdatedAt.toISOString()}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {!paymentFeatureEnabled && (
        <Alert variant="info">
          <AlertTitle>オンライン決済機能が OFF です</AlertTitle>
          <AlertDescription>
            新規 checkout は無効です。Stripe credentials
            が設定されていれば、Webhook
            による決済確定・返金反映などの精算処理は継続します。有効化は「
            <Link
              href="/admin/settings/features"
              className="underline underline-offset-4 hover:text-foreground"
            >
              機能モジュール
            </Link>
            」の「オンライン決済」から行えます。
          </AlertDescription>
        </Alert>
      )}
      <SettingsTabs tabs={tabs} defaultTab="payment" />
    </div>
  );
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
  await requireAdminPermission("settings", "manage");

  return (
    <SettingsLayout
      title="課金・決済"
      description="Stripe オンライン決済・割引・消費税・返金ポリシーの設定"
    >
      <Suspense fallback={<BillingSettingsLoading />}>
        <BillingSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
