const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEventDateTimeRange(
  startTime: string,
  endTime: string,
): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const datePart = dateFormatter.format(start);
  const startTimePart = timeFormatter.format(start);
  const endTimePart = timeFormatter.format(end);
  return `${datePart} ${startTimePart} - ${endTimePart}`;
}
