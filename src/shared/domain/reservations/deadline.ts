import { MS_PER_HOUR } from "@/shared/lib/date-format";

export function isWithinDeadline(
  startTime: Date,
  deadlineHours: number,
  now: Date,
): boolean {
  const deadlineMs = deadlineHours * MS_PER_HOUR;
  const timeUntilStart = startTime.getTime() - now.getTime();
  return timeUntilStart >= deadlineMs;
}
