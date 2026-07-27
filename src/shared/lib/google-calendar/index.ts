export type {
  CalendarEventInstance,
  CalendarEventParams,
  CalendarEventResult,
  CalendarConnectionTestResult,
  GoogleCalendarSettings,
  CalendarChange,
  SyncChangesResult,
  WebhookSetupResult,
  WebhookRenewalResult,
  TwoWaySyncSettings,
} from "./types";

export { formatGoogleApiError } from "./helpers";

export {
  getServiceAccountClient,
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

export {
  setupWebhookWatch,
  stopWebhookWatch,
  renewWebhookIfNeeded,
} from "./webhook";

export {
  testServiceAccountConnection,
  isGoogleCalendarEnabled,
  isGoogleCalendarConfigured,
  isTwoWaySyncEnabled,
  isValidCalendarId,
} from "./settings";
