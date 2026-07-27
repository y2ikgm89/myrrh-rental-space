/**
 * メール・通知設定ページ
 *
 * メール送信元、管理者通知チャネル、テンプレートのプレビュー＆テスト送信を管理。
 * Stripe 決済は /admin/settings/billing に移動済み。
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  getSettings,
  getNotificationStaffCandidates,
} from "@/admin/queries/settings";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { requireAdminSettingsPage } from "@/admin/helpers/page-auth";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { isEmailEnabled } from "@/shared/domain/settings/queries/email-render-context";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  EmailSection,
  EmailTemplatesSection,
  NotificationSection,
} from "../_components/sections";
import type { ReactElement } from "react";

function EmailDeliveryDisabledBanner(): ReactElement {
  return (
    <div
      role="alert"
      className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      <p className="font-medium">メール送信が無効です</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Resend API キーが未設定のため、通知メールやテスト送信は実行できません。
        SUPER_ADMIN は
        <Link
          href="/admin/settings/integrations?tab=resend"
          className="mx-1 underline underline-offset-4 hover:text-accent"
        >
          連携設定
        </Link>
        で Resend API キーを設定してください（環境変数{" "}
        <code className="font-mono">RESEND_API_KEY</code> でも代替可能です）。
      </p>
    </div>
  );
}

async function NotificationsSettingsContent(): Promise<ReactElement> {
  await connection();
  const [
    settings,
    staff,
    auth,
    emailEnabled,
    reservationEnabled,
    contactEnabled,
    eventsEnabled,
  ] = await Promise.all([
    getSettings(),
    getNotificationStaffCandidates(),
    checkAdminAuth(),
    isEmailEnabled(),
    isFeatureEnabled("reservation"),
    isFeatureEnabled("contact"),
    isFeatureEnabled("events"),
  ]);

  if (!settings || !auth.success) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        設定を読み込めませんでした
      </div>
    );
  }

  const readOnly = !hasPermission(auth.user.role, "settings", "update");

  const tabs = [
    {
      value: "email",
      label: "メール",
      content: (
        <div className="space-y-4">
          {!emailEnabled ? <EmailDeliveryDisabledBanner /> : null}
          <EmailSection
            settings={settings}
            staff={staff}
            readOnly={readOnly}
            reservationEnabled={reservationEnabled}
            eventsEnabled={eventsEnabled}
          />
        </div>
      ),
    },
    {
      value: "notification",
      label: "通知",
      content: (
        <NotificationSection
          settings={settings}
          readOnly={readOnly}
          reservationEnabled={reservationEnabled}
          contactEnabled={contactEnabled}
          eventsEnabled={eventsEnabled}
        />
      ),
    },
    {
      value: "templates",
      label: "テンプレート",
      content: (
        <div className="space-y-4">
          {!emailEnabled ? <EmailDeliveryDisabledBanner /> : null}
          <EmailTemplatesSection
            defaultRecipient={auth.user.email}
            readOnly={readOnly}
          />
        </div>
      ),
    },
  ];

  return <SettingsTabs tabs={tabs} defaultTab="email" />;
}

function NotificationsSettingsLoading(): ReactElement {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
        <div className="h-8 w-16 bg-muted-foreground/30 rounded-md" />
        <div className="h-8 w-12 bg-muted rounded-md" />
        <div className="h-8 w-20 bg-muted rounded-md" />
      </div>
      <div className="h-48 bg-muted rounded" />
    </div>
  );
}

export default async function NotificationsSettingsPage(): Promise<ReactElement> {
  await connection();
  const user = await requireAdminSettingsPage();
  const readOnly = !hasPermission(user.role, "settings", "update");

  return (
    <SettingsLayout
      title="メール・通知"
      description="メール送信元、管理者通知メール、テンプレートのプレビュー & テスト送信"
      readOnly={readOnly}
    >
      <Suspense fallback={<NotificationsSettingsLoading />}>
        <NotificationsSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
