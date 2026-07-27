"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { BlockedDatesField } from "@/admin/components/BlockedDatesField";
import {
  createLocationBlockedDate,
  deleteLocationBlockedDate,
} from "@/admin/actions/location-blocked-dates";
import type { LocationBlockedDatesTabProps } from "./types";

export function LocationBlockedDatesTab({
  locationId,
  initialBlockedDates,
}: LocationBlockedDatesTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>臨時休業 / 急な休み</CardTitle>
      </CardHeader>
      <CardContent>
        <BlockedDatesField
          entityId={locationId}
          initialBlockedDates={initialBlockedDates}
          createAction={createLocationBlockedDate}
          deleteAction={deleteLocationBlockedDate}
          description="この拠点に登録された全スペースの予約を、指定した日付で受け付けません（拠点全体の臨時休業）。"
        />
      </CardContent>
    </Card>
  );
}
