/**
 * 外部連携設定ページ
 *
 * 各外部サービス API キーをタブで切り替え
 * 旧 /api からリネーム
 */

import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  getResendConfig,
  getTurnstileConfig,
  getGoogleMapsConfig,
  getCustomApiKeys,
} from "@/admin/queries/api-keys";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { getInstagramConfig } from "@/admin/queries/instagram";
import { getSettings } from "@/admin/queries/settings";
import { getGbpAuthState } from "@/shared/lib/google-business-profile";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  ResendSection,
  TurnstileSection,
  GoogleMapsSection,
  CustomApiKeysSection,
  GoogleCalendarSection,
  GoogleBusinessProfileSection,
  TwoWaySyncSection,
  InstagramSection,
} from "../_components/sections";
import type { ReactElement } from "react";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  readonly searchParams: Promise<SearchParams>;
};

function getGbpCanonicalUrl(searchParams: SearchParams): string | null {
  if (
    searchParams["gbp_success"] === undefined &&
    searchParams["gbp_error"] === undefined
  ) {
    return null;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "gbp_success" || key === "gbp_error") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  const next = params.toString();
  return `/admin/settings/integrations${next ? `?${next}` : ""}`;
}

async function IntegrationsSettingsContent(): Promise<ReactElement> {
  await connection();
  const [
    resendConfig,
    turnstileConfig,
    googleMapsConfig,
    customApiKeys,
    settings,
    instagramConfig,
    gbpAuthState,
  ] = await Promise.all([
    getResendConfig(),
    getTurnstileConfig(),
    getGoogleMapsConfig(),
    getCustomApiKeys(),
    getSettings(),
    getInstagramConfig(),
    getGbpAuthState(),
  ]);

  const gbpAuthInfo = gbpAuthState
    ? { accountName: gbpAuthState.accountName }
    : null;

  const tabs = [
    {
      value: "resend",
      label: "Resend",
      content: <ResendSection config={resendConfig} />,
    },
    {
      value: "turnstile",
      label: "Turnstile",
      content: <TurnstileSection config={turnstileConfig} />,
    },
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
                <TwoWaySyncSection settings={settings} />
              </div>
            ),
          },
        ]
      : []),
    {
      value: "instagram",
      label: "Instagram",
      content: <InstagramSection config={instagramConfig} />,
    },
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

function IntegrationsSettingsLoading(): ReactElement {
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

export default async function IntegrationsSettingsPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await requireAdminPermission("settings", "manage");
  const canonicalUrl = getGbpCanonicalUrl(await searchParams);
  if (canonicalUrl) redirect(toAppRoute(canonicalUrl));

  return (
    <SettingsLayout
      title="外部連携"
      description="外部サービスとの連携に必要な API キーを管理します"
    >
      <Suspense fallback={<IntegrationsSettingsLoading />}>
        <IntegrationsSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
