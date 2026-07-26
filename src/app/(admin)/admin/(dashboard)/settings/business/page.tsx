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
import { getGlobalBlockedDates } from "@/admin/queries/blocked-dates";
import { requireAdminSettingsPage } from "@/admin/helpers/page-auth";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { BlockedDatesField } from "@/admin/components/BlockedDatesField";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import {
  createGlobalBlockedDate,
  deleteGlobalBlockedDate,
} from "@/admin/actions/global-blocked-dates";
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
  const user = await requireAdminSettingsPage();
  const readOnly = !hasPermission(user.role, "settings", "update");

  const [settings, blockedDates] = await Promise.all([
    getSettings(),
    getGlobalBlockedDates(),
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
      value: "info",
      label: "事業者情報",
      content: <BusinessInfoSection settings={settings} readOnly={readOnly} />,
    },
    {
      value: "hours",
      label: "営業時間",
      content: <BusinessHoursSection settings={settings} readOnly={readOnly} />,
    },
    {
      value: "reservation",
      label: "予約",
      content: <ReservationSection settings={settings} readOnly={readOnly} />,
    },
    {
      value: "holidays",
      label: "休業日",
      content: (
        <Card>
          <CardHeader>
            <CardTitle>全社の臨時休業 / 急な休み</CardTitle>
          </CardHeader>
          <CardContent>
            <BlockedDatesField
              entityId=""
              initialBlockedDates={blockedDates}
              createAction={createGlobalBlockedDate}
              deleteAction={deleteGlobalBlockedDate}
              readOnly={readOnly}
              description="全スペース・全拠点の予約を、指定した日付で一斉に受け付けません（年末年始・大規模災害などの全社休業）。"
            />
          </CardContent>
        </Card>
      ),
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
        <div className="h-8 w-14 bg-muted rounded-md" />
      </div>
      <div className="h-48 bg-muted rounded" />
    </div>
  );
}

export default async function BusinessSettingsPage(): Promise<ReactElement> {
  await connection();
  const user = await requireAdminSettingsPage();
  const readOnly = !hasPermission(user.role, "settings", "update");

  return (
    <SettingsLayout
      title="ビジネス設定"
      description="事業者情報・営業時間・予約・休業日の設定"
      readOnly={readOnly}
    >
      <Suspense fallback={<BusinessSettingsLoading />}>
        <BusinessSettingsContent />
      </Suspense>
    </SettingsLayout>
  );
}
