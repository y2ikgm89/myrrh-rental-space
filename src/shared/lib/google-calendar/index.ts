export type {
  CalendarEventInstance,
  CalendarEventParams,
  CalendarEventResult,
  CalendarConnectionTestResult,
  GoogleCalendarClientContext,
  GoogleCalendarEventWriteContext,
  GoogleCalendarSettings,
  CalendarChange,
  SyncChangesResult,
  WebhookSetupResult,
  WebhookRenewalResult,
  TwoWaySyncSettings,
} from "./types";

export { formatGoogleApiError } from "./helpers";

export {
  createCalendarClientFromServiceAccountJson,
  encryptServiceAccountJson,
} from "./service-account";

export {
  createCalendarEvent,
  updateCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
  addMeetConferenceToCalendarEvent,
  fetchEventInstances,
  getCalendarEvent,
} from "./events";

export { fetchCalendarChanges } from "./sync";
export type { FetchCalendarChangesOptions } from "./sync";

export { setupWebhookWatch, stopWebhookWatch } from "./webhook";

export { testServiceAccountConnection, isValidCalendarId } from "./settings";
