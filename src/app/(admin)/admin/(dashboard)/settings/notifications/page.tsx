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
import { connection } from "next/server";
import {
  getSettings,
  getNotificationStaffCandidates,
} from "@/admin/queries/settings";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { SettingsLayout } from "../_components/SettingsLayout";
import { SettingsTabs } from "../_components/SettingsTabs";
import {
  EmailSection,
  EmailTemplatesSection,
  NotificationSection,
} from "../_components/sections";
import type { ReactElement } from "react";

async function NotificationsSettingsContent(): Promise<ReactElement> {
  await connection();
  const [settings, staff, auth] = await Promise.all([
    getSettings(),
    getNotificationStaffCandidates(),
    checkAdminAuth(),
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
        <EmailSection settings={settings} staff={staff} readOnly={readOnly} />
      ),
    },
    {
      value: "notification",
      label: "通知",
      content: <NotificationSection settings={settings} readOnly={readOnly} />,
    },
    {
      value: "templates",
      label: "テンプレート",
      content: (
        <EmailTemplatesSection
          defaultRecipient={auth.user.email}
          readOnly={readOnly}
        />
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
  const user = await requireAdminPermission("settings", "read");
  const readOnly = !hasPermission(user.role, "settings", "update");

  return (
    <SettingsLayout
      title="メール・通知"
      description="メール送信元、管理者通知、テンプレートのプレビュー & テスト送信"
      readOnly={readOnly}
    >
      <Suspense fallback={<NotificationsSettingsLoading />}>
        <NotificationsSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
