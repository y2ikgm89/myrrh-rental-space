"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TabsContent,
} from "@/admin/components/ui";
import { BlockedDatesField } from "@/admin/components/BlockedDatesField";
import {
  createSpaceBlockedDate,
  deleteSpaceBlockedDate,
} from "@/admin/actions/space-blocked-dates";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";

type SpaceEditBlockedDatesTabProps = {
  spaceId: string;
  initialBlockedDates: readonly BlockedDateData[];
};

export function SpaceEditBlockedDatesTab({
  spaceId,
  initialBlockedDates,
}: SpaceEditBlockedDatesTabProps) {
  return (
    <TabsContent
      value="blocked-dates"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <Card>
        <CardHeader>
          <CardTitle>臨時休業 / 急な休み</CardTitle>
        </CardHeader>
        <CardContent>
          <BlockedDatesField
            entityId={spaceId}
            initialBlockedDates={initialBlockedDates}
            createAction={createSpaceBlockedDate}
            deleteAction={deleteSpaceBlockedDate}
            description="設備故障・点検などで特定の日付を予約不可にします（営業時間の定休日とは別管理）。"
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
