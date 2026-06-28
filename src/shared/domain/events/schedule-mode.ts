import { EventScheduleMode } from "@/shared/lib/validations/enums/prisma-types";

export type EventScheduleModeValue =
  (typeof EventScheduleMode)[keyof typeof EventScheduleMode];

export const EVENT_SCHEDULE_MODE_LABELS: Record<
  EventScheduleModeValue,
  string
> = {
  [EventScheduleMode.SINGLE_OCCURRENCE]: "単一開催",
  [EventScheduleMode.TIMED_ENTRY]: "日時選択制",
};

export function getEventScheduleModeLabel(
  mode: EventScheduleModeValue,
): string {
  return EVENT_SCHEDULE_MODE_LABELS[mode];
}
