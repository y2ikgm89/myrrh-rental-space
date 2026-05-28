/**
 * /admin/settings/holidays — 全社休業日（GLOBAL BlockedDate）管理
 *
 * 全スペース・全拠点に適用される臨時休業を CRUD 管理する。
 * ユースケース: 全社年末年始・大規模災害による全店休業。
 * cascade additive 判定（isDateBlocked）で per-space / per-location 休業と OR 結合される。
 */

import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { BlockedDatesField } from "@/admin/components/BlockedDatesField";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { getGlobalBlockedDates } from "@/shared/domain/blocked-dates/queries";
import {
  createGlobalBlockedDate,
  deleteGlobalBlockedDate,
} from "@/admin/actions/global-blocked-dates";

export const metadata: Metadata = {
  title: "全社休業日 — 設定",
  robots: { index: false, follow: false },
};

export default async function HolidaysSettingsPage() {
  await connection();

  const blockedDates = await getGlobalBlockedDates();

  return (
    <AdminDetailLayout
      backHref="/admin/settings"
      title="全社休業日"
      subtitle="全スペース・全拠点に適用される臨時休業を管理します"
    >
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
            description="全スペース・全拠点の予約を、指定した日付で一斉に受け付けません（年末年始・大規模災害などの全社休業）。"
          />
        </CardContent>
      </Card>
    </AdminDetailLayout>
  );
}
