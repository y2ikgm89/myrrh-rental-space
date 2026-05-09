/**
 * 外部連携設定ページ
 *
 * 各外部サービスAPIキーをタブで切り替え
 * Next.js 16 PPR対応
 */

import { Suspense } from "react";
import { connection } from "next/server";
import {
  getResendConfig,
  getTurnstileConfig,
  getGoogleMapsConfig,
  getCloudflareConfig,
  getCustomApiKeys,
} from "@/admin/queries/api-keys";
import { getInstagramConfig } from "@/admin/queries/instagram";
import { getSettings } from "@/admin/queries/settings";
import { getGbpAuthState } from "@/shared/lib/google-business-profile";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  ResendSection,
  TurnstileSection,
  GoogleMapsSection,
  CloudflareSection,
  CustomApiKeysSection,
  GoogleCalendarSection,
  GoogleBusinessProfileSection,
  ICalFeedSection,
  TwoWaySyncSection,
  InstagramSection,
} from "../_components/sections";
import type { ReactElement } from "react";

/**
 * 動的コンテンツ: API設定
 */
async function ApiSettingsContent(): Promise<ReactElement> {
  await connection();
  const [
    resendConfig,
    turnstileConfig,
    googleMapsConfig,
    cloudflareConfig,
    customApiKeys,
    settings,
    instagramConfig,
    gbpAuthState,
  ] = await Promise.all([
    getResendConfig(),
    getTurnstileConfig(),
    getGoogleMapsConfig(),
    getCloudflareConfig(),
    getCustomApiKeys(),
    getSettings(),
    getInstagramConfig(),
    getGbpAuthState(),
  ]);

  const gbpAuthInfo = gbpAuthState
    ? { accountName: gbpAuthState.accountName }
    : null;

  const tabs = [
    // メール
    {
      value: "resend",
      label: "Resend",
      content: <ResendSection config={resendConfig} />,
    },
    // Cloudflare系
    {
      value: "turnstile",
      label: "Turnstile",
      content: <TurnstileSection config={turnstileConfig} />,
    },
    {
      value: "cloudflare",
      label: "Cloudflare",
      content: <CloudflareSection config={cloudflareConfig} />,
    },
    // Google系
    {
      value: "google-maps",
      label: "Google Maps",
      content: <GoogleMapsSection config={googleMapsConfig} />,
    },
    ...(settings
      ? [
          {
            value: "calendar",
            label: "カレンダー",
            content: (
              <div className="space-y-6">
                <GoogleCalendarSection settings={settings} />
                <GoogleBusinessProfileSection
                  enabled={settings.googleBusinessProfileEnabled}
                  authInfo={gbpAuthInfo}
                />
                <ICalFeedSection />
                <TwoWaySyncSection settings={settings} />
              </div>
            ),
          },
        ]
      : []),
    // SNS
    {
      value: "instagram",
      label: "Instagram",
      content: <InstagramSection config={instagramConfig} />,
    },
    // 拡張
    {
      value: "custom",
      label: "カスタム",
      content: <CustomApiKeysSection keys={customApiKeys} />,
    },
  ];

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          すべてのシークレットキーは暗号化して保存されます。
        </p>
      </div>
      <SettingsTabs tabs={tabs} defaultTab="resend" />
    </>
  );
}

/**
 * ローディングUI
 */
function ApiSettingsLoading(): ReactElement {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          すべてのシークレットキーは暗号化して保存されます。
        </p>
      </div>
      <div className="animate-pulse space-y-6">
        <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
          <div className="h-8 w-16 bg-muted-foreground/30 rounded-md" />
          <div className="h-8 w-18 bg-muted rounded-md" />
          <div className="h-8 w-24 bg-muted rounded-md" />
          <div className="h-8 w-16 bg-muted rounded-md" />
          <div className="h-8 w-20 bg-muted rounded-md" />
        </div>
        <div className="h-48 bg-muted rounded" />
      </div>
    </div>
  );
}

export default async function ApiSettingsPage(): Promise<ReactElement> {
  return (
    <SettingsLayout
      title="外部連携"
      description="外部サービスとの連携に必要なAPIキーを管理します"
    >
      <Suspense fallback={<ApiSettingsLoading />}>
        <ApiSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
