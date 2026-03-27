export function isWithinDeadline(
  startTime: Date,
  deadlineHours: number,
  now: Date,
): boolean {
  const deadlineMs = deadlineHours * 60 * 60 * 1000;
  const timeUntilStart = startTime.getTime() - now.getTime();
  return timeUntilStart >= deadlineMs;
}
