/**
 * Add to Calendar URL ビルダー（client-safe）
 *
 * Google Calendar / Outlook Web の登録 URL を組み立てる純粋関数。
 * `ical-generator`（Node.js 専用）に依存しないため Client Component から
 * 安全に import できる。ICS 生成は {@link "./index"} を使う（server-only）。
 *
 * @module shared/lib/ical/urls
 */

import type { AddToCalendarUrls, CalendarEventInput } from "./types";

function formatUtcCompact(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${formatUtcCompact(event.startTime)}/${formatUtcCompact(event.endTime)}`,
    details: event.description,
  });
  if (event.location !== undefined) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookWebUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: event.startTime.toISOString(),
    enddt: event.endTime.toISOString(),
    subject: event.summary,
    body: event.description,
  });
  if (event.location !== undefined) params.set("location", event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export type BuildAddToCalendarUrlsParams = CalendarEventInput & {
  readonly icsDownloadUrl: string;
};

export function buildAddToCalendarUrls(
  params: BuildAddToCalendarUrlsParams,
): AddToCalendarUrls {
  return {
    google: buildGoogleCalendarUrl(params),
    outlookWeb: buildOutlookWebUrl(params),
    ics: params.icsDownloadUrl,
  };
}

export type { AddToCalendarUrls, CalendarEventInput } from "./types";
