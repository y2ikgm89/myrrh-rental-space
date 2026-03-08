export function formatDate(
  date: Date | string | null | undefined,
  includeTime = false,
): string {
  if (!date) return "";

  const value = typeof date === "string" ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return value.toLocaleDateString("ja-JP", options);
}

export function formatDateShort(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatDateTimeShort(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function formatDateTimeFull(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
