/**
 * Google Calendar ID validation (client-safe, no server-only).
 *
 * SSoT for calendar ID shape: "primary" or email-like ID.
 * Re-exported from `./settings` for server-side callers.
 */
export function isValidCalendarId(calendarId: string): boolean {
  if (!calendarId) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return calendarId === "primary" || emailRegex.test(calendarId);
}
